import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run, shellEnv } from "./system";

/**
 * Built-in macOS system-audio capture (no BlackHole, no Multi-Output Device).
 * A tiny Swift helper uses ScreenCaptureKit (macOS 13+) to capture everything the Mac plays
 * and streams mono Float32 PCM on stdout. It is compiled once on the user's Mac with the
 * Xcode Command Line Tools (already present when Homebrew is installed).
 */

export const HELPER_VERSION = 1;
export const HELPER_NAME = `nrt-system-audio-v${HELPER_VERSION}`;

const SWIFT_SOURCE = String.raw`
import Foundation
import AVFoundation
import CoreMedia
import ScreenCaptureKit

signal(SIGPIPE, SIG_IGN)

func logLine(_ s: String) {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

func writeAll(_ base: UnsafeRawPointer, _ count: Int) {
    var off = 0
    while off < count {
        let r = Darwin.write(1, base + off, count - off)
        if r < 0 { if errno == EINTR { continue }; exit(0) }
        if r == 0 { exit(0) }
        off += r
    }
}

@available(macOS 13.0, *)
final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var scStream: SCStream?
    private let audioQueue = DispatchQueue(label: "nrt.audio")
    private let screenQueue = DispatchQueue(label: "nrt.screen")
    private var mono = [Float]()
    private var warned = false
    let sampleRate = 48000

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "nrt", code: 1, userInfo: [NSLocalizedDescriptionKey: "No display found"])
        }
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.capturesAudio = true
        cfg.excludesCurrentProcessAudio = true
        cfg.sampleRate = sampleRate
        cfg.channelCount = 2
        cfg.width = 2
        cfg.height = 2
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        cfg.showsCursor = false
        let s = SCStream(filter: filter, configuration: cfg, delegate: self)
        try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: screenQueue)
        try await s.startCapture()
        scStream = s
        logLine("READY \(sampleRate)")
    }

    func stop() async {
        try? await scStream?.stopCapture()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, CMSampleBufferIsValid(sb) else { return }
        guard let fd = CMSampleBufferGetFormatDescription(sb),
              let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(fd) else { return }
        let asbd = asbdPtr.pointee
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0 && asbd.mBitsPerChannel == 32
        if !isFloat {
            if !warned { logLine("WARN unsupported audio format"); warned = true }
            return
        }
        let n = Int(CMSampleBufferGetNumSamples(sb))
        if n <= 0 { return }

        var needed = 0
        var st = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sb, bufferListSizeNeededOut: &needed, bufferListOut: nil, bufferListSize: 0,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: nil)
        guard st == noErr, needed > 0 else { return }
        let raw = UnsafeMutableRawPointer.allocate(byteCount: needed, alignment: 16)
        defer { raw.deallocate() }
        let abl = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
        var block: CMBlockBuffer?
        st = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sb, bufferListSizeNeededOut: nil, bufferListOut: abl, bufferListSize: needed,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: UInt32(kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment), blockBufferOut: &block)
        guard st == noErr else { return }
        let buffers = UnsafeMutableAudioBufferListPointer(abl)

        if mono.count < n { mono = [Float](repeating: 0, count: n) }
        mono.withUnsafeMutableBufferPointer { out in
            for i in 0..<n { out[i] = 0 }
            if buffers.count > 1 {
                let scale = 1 / Float(buffers.count)
                for b in buffers {
                    guard let d = b.mData else { continue }
                    let p = d.assumingMemoryBound(to: Float.self)
                    let m = min(n, Int(b.mDataByteSize) / 4)
                    for i in 0..<m { out[i] += p[i] * scale }
                }
            } else if let b = buffers.first, let d = b.mData {
                let ch = max(1, Int(b.mNumberChannels))
                let p = d.assumingMemoryBound(to: Float.self)
                let m = min(n, Int(b.mDataByteSize) / 4 / ch)
                let scale = 1 / Float(ch)
                for i in 0..<m {
                    var s: Float = 0
                    for c in 0..<ch { s += p[i * ch + c] }
                    out[i] = s * scale
                }
            }
            writeAll(UnsafeRawPointer(out.baseAddress!), n * 4)
        }
        _ = block
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let ns = error as NSError
        logLine("ERROR \(ns.code) \(ns.localizedDescription)")
        exit(4)
    }
}

@available(macOS 13.0, *)
func runCapture() {
    let capture = SystemAudioCapture()
    let finish = {
        DispatchQueue.global().asyncAfter(deadline: .now() + 1.5) { exit(0) }
        Task { await capture.stop(); exit(0) }
    }
    Task {
        do { try await capture.start() }
        catch {
            let ns = error as NSError
            logLine("ERROR \(ns.code) \(ns.localizedDescription)")
            exit(2)
        }
    }
    signal(SIGTERM, SIG_IGN)
    let term = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    term.setEventHandler { finish() }
    term.resume()
    // Parent closes stdin to stop us (and if Obsidian quits, stdin hits EOF too).
    Thread.detachNewThread {
        while readLine() != nil {}
        finish()
    }
    withExtendedLifetime(term) { dispatchMain() }
}

if #available(macOS 13.0, *) {
    runCapture()
} else {
    logLine("ERROR 0 macOS 13 (Ventura) or later is required")
    exit(3)
}
`;

/* ------------------------------------------------------------------ */

export function nativeSupported(): boolean {
	// Darwin 22 = macOS 13 Ventura
	return process.platform === "darwin" && parseInt(os.release().split(".")[0], 10) >= 22;
}

export function helperPath(pluginDir: string): string {
	return path.join(pluginDir, "bin", HELPER_NAME);
}

export function helperBuilt(pluginDir: string): boolean {
	return fs.existsSync(helperPath(pluginDir));
}

/** True when the Xcode Command Line Tools (and thus `swiftc`) are installed. */
export async function canBuildHelper(): Promise<boolean> {
	if (process.platform !== "darwin") return false;
	const code = await run("/usr/bin/xcode-select", ["-p"]).catch(() => 1);
	return code === 0;
}

let building: Promise<string> | null = null;

/** Compiles the helper (once). Resolves with the binary path. */
export function buildHelper(pluginDir: string, onLine?: (l: string) => void): Promise<string> {
	if (building) return building;
	building = (async () => {
		const out = helperPath(pluginDir);
		fs.mkdirSync(path.dirname(out), { recursive: true });
		const src = path.join(os.tmpdir(), `${HELPER_NAME}.swift`);
		fs.writeFileSync(src, SWIFT_SOURCE);
		const tail: string[] = [];
		const code = await run(
			"/usr/bin/xcrun",
			["swiftc", "-O", "-swift-version", "5", "-o", out + ".tmp", src],
			(l) => {
				tail.push(l);
				if (tail.length > 8) tail.shift();
				onLine?.(l);
			},
		);
		if (code !== 0 || !fs.existsSync(out + ".tmp")) {
			throw new Error(`Building the system-audio helper failed: ${tail.slice(-3).join(" | ") || "exit " + code}`);
		}
		fs.renameSync(out + ".tmp", out);
		fs.chmodSync(out, 0o755);
		return out;
	})().finally(() => {
		building = null;
	});
	return building;
}

export class NativeAudioError extends Error {
	constructor(readonly code: number, message: string) {
		super(message);
	}
	get isPermission(): boolean {
		return this.code === -3801 || /declin|permission|not authori[sz]ed|TCC/i.test(this.message);
	}
}

export const PERMISSION_HELP =
	"Allow Obsidian in System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen Obsidian.";

export function openScreenRecordingSettings(): void {
	void run("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"]).catch(() => undefined);
}

/** Runs the helper and streams mono Float32 chunks to `onData`. */
export class NativeSystemAudio {
	private proc: ChildProcess | null = null;
	private rest: Buffer | null = null;
	rate = 48000;
	onData: ((f32: Float32Array) => void) | null = null;

	constructor(private readonly bin: string) {}

	start(timeoutMs = 10000): Promise<number> {
		return new Promise((resolve, reject) => {
			let settled = false;
			const done = (err: Error | null) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				if (err) {
					this.stop();
					reject(err);
				} else resolve(this.rate);
			};
			const timer = window.setTimeout(
				() => done(new NativeAudioError(-1, "System-audio capture did not start (macOS permission prompt pending?). " + PERMISSION_HELP)),
				timeoutMs,
			);

			const proc = spawn(this.bin, [], { env: shellEnv(), stdio: ["pipe", "pipe", "pipe"] });
			this.proc = proc;
			let errBuf = "";
			proc.stderr!.on("data", (b: Buffer) => {
				errBuf += b.toString();
				let i: number;
				while ((i = errBuf.indexOf("\n")) >= 0) {
					const line = errBuf.slice(0, i).trim();
					errBuf = errBuf.slice(i + 1);
					const ready = line.match(/^READY (\d+)/);
					const err = line.match(/^ERROR (-?\d+) (.*)$/);
					if (ready) {
						this.rate = Number(ready[1]);
						done(null);
					} else if (err) {
						const e = new NativeAudioError(Number(err[1]), err[2]);
						if (e.isPermission) e.message = "macOS blocked system-audio capture. " + PERMISSION_HELP;
						done(e);
					} else if (line) console.debug("[note-recorder helper]", line);
				}
			});
			proc.stdout!.on("data", (b: Buffer) => this.handle(b));
			proc.on("error", (e) => done(e));
			proc.on("exit", (code) => {
				this.proc = null;
				done(new NativeAudioError(code ?? -1, `System-audio helper exited (code ${code}).`));
			});
		});
	}

	private handle(chunk: Buffer): void {
		const buf = this.rest ? Buffer.concat([this.rest, chunk]) : chunk;
		const usable = buf.length - (buf.length % 4);
		this.rest = usable < buf.length ? Buffer.from(buf.subarray(usable)) : null;
		if (!usable || !this.onData) return;
		const f32 = new Float32Array(usable / 4);
		new Uint8Array(f32.buffer).set(buf.subarray(0, usable));
		this.onData(f32);
	}

	stop(): void {
		const p = this.proc;
		if (!p) return;
		this.proc = null;
		this.onData = null;
		try {
			p.stdin?.end();
		} catch {
			/* ignore */
		}
		window.setTimeout(() => {
			if (p.exitCode === null) p.kill("SIGKILL");
		}, 2500);
	}
}

/** Listens for `ms` and returns the peak level (0..1) of captured system audio. */
export async function testNative(bin: string, ms = 4000): Promise<number> {
	const cap = new NativeSystemAudio(bin);
	let peak = 0;
	cap.onData = (f) => {
		for (let i = 0; i < f.length; i++) {
			const v = Math.abs(f[i]);
			if (v > peak) peak = v;
		}
	};
	await cap.start();
	await new Promise((r) => window.setTimeout(r, ms));
	cap.stop();
	return peak;
}
