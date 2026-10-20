/* Note Recorder & Transcriber — prebuilt bundle. Source: src/*.ts */
"use strict";
var __nrt_modules = {
"./devices": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOOPBACK_RE = void 0;
exports.listAudioInputs = listAudioInputs;
exports.resolveSystemDevice = resolveSystemDevice;
exports.defaultInputIsLoopback = defaultInputIsLoopback;
/** Virtual loopback drivers commonly used to capture macOS system audio. */
exports.LOOPBACK_RE = /blackhole|loopback|soundflower|ishowu|background music|zoomaudiodevice|ms teams audio/i;
async function listAudioInputs() {
    const read = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
    let devices = await read();
    // Labels stay empty until microphone permission has been granted once.
    if (devices.length && devices.every((d) => !d.label)) {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach((t) => t.stop());
            devices = await read();
        }
        catch (_a) {
            /* permission denied — return unlabeled list */
        }
    }
    return devices;
}
const isAlias = (d) => d.deviceId === "default" || d.deviceId === "communications";
/** Resolves the "system audio" setting ("auto" | deviceId) to a concrete input device. */
async function resolveSystemDevice(setting) {
    var _a, _b;
    if (setting === "none" || setting === "native")
        return null;
    const devices = (await listAudioInputs()).filter((d) => !isAlias(d));
    if (setting !== "auto")
        return (_a = devices.find((d) => d.deviceId === setting)) !== null && _a !== void 0 ? _a : null;
    return (_b = devices.find((d) => exports.LOOPBACK_RE.test(d.label))) !== null && _b !== void 0 ? _b : null;
}
/** Warn when the default input is a loopback driver (the "mic" would then be system audio). */
async function defaultInputIsLoopback() {
    const def = (await listAudioInputs()).find((d) => d.deviceId === "default");
    return !!def && exports.LOOPBACK_RE.test(def.label);
}

},
"./main": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const path = __importStar(require("path"));
const settings_1 = require("./settings");
const session_1 = require("./session");
const ui_1 = require("./ui");
const setup_1 = require("./setup");
const system_1 = require("./system");
class NoteRecorderPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.session = null;
        this.jobs = [];
        this.caffeinate = null;
    }
    /** Absolute path of this plugin's folder. */
    get pluginDir() {
        var _a;
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof obsidian_1.FileSystemAdapter))
            throw new Error("Desktop vault required");
        return path.join(adapter.getBasePath(), (_a = this.manifest.dir) !== null && _a !== void 0 ? _a : `${this.app.vault.configDir}/plugins/${this.manifest.id}`);
    }
    get modelsDir() {
        return path.join(this.pluginDir, "models");
    }
    async onload() {
        await this.loadSettings();
        const ribbon = this.addRibbonIcon("mic", "Start recording in current note", () => this.toggleRecording());
        ribbon.addClass("nrt-ribbon");
        this.ui = new ui_1.NoteUI(this, ribbon, this.addStatusBarItem());
        this.addSettingTab(new settings_1.RecorderSettingTab(this.app, this));
        this.addCommand({ id: "toggle-recording", name: "Start / stop recording in current note", callback: () => this.toggleRecording() });
        this.addCommand({
            id: "pause-recording",
            name: "Pause / resume recording",
            checkCallback: (checking) => {
                if (!this.session || this.session.phase === "starting" || this.session.phase === "stopping")
                    return false;
                if (!checking)
                    this.togglePause();
                return true;
            },
        });
        this.addCommand({
            id: "discard-recording",
            name: "Discard current recording",
            checkCallback: (checking) => {
                if (!this.session)
                    return false;
                if (!checking)
                    void this.cancelRecording();
                return true;
            },
        });
        this.addCommand({ id: "open-setup", name: "Open setup assistant", callback: () => this.openSetup() });
        const refresh = () => this.ui.refresh();
        this.registerEvent(this.app.workspace.on("layout-change", refresh));
        this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
        this.registerEvent(this.app.workspace.on("file-open", refresh));
        this.registerEvent(this.app.vault.on("rename", refresh));
        this.app.workspace.onLayoutReady(() => {
            this.ui.refresh();
            if (!this.settings.setupSeen) {
                this.settings.setupSeen = true;
                void this.saveSettings();
                this.openSetup();
            }
        });
    }
    onunload() {
        var _a;
        if (this.session)
            void this.session.cancel();
        this.session = null;
        (_a = this.ui) === null || _a === void 0 ? void 0 : _a.destroy();
        this.setKeepAwake(false);
    }
    /* ---------------- recording control ---------------- */
    toggleRecording(view) {
        if (this.session) {
            if (this.session.phase === "recording" || this.session.phase === "paused")
                void this.stopRecording();
            return;
        }
        void this.startRecording(view);
    }
    async startRecording(view) {
        var _a;
        const target = view !== null && view !== void 0 ? view : this.app.workspace.getActiveViewOfType(obsidian_1.MarkdownView);
        if (!(target === null || target === void 0 ? void 0 : target.file)) {
            new obsidian_1.Notice("Open a note first — the recording is added to it.");
            return;
        }
        const session = new session_1.RecordingSession(this, target.file, target);
        this.session = session;
        this.ui.refresh();
        try {
            await session.start();
            this.setKeepAwake(true);
        }
        catch (e) {
            this.session = null;
            const err = e;
            const msg = (err === null || err === void 0 ? void 0 : err.name) === "NotAllowedError"
                ? "Microphone access denied. Allow Obsidian in System Settings → Privacy & Security → Microphone."
                : `Could not start recording: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : e}`;
            new obsidian_1.Notice(msg, 8000);
        }
        this.ui.refresh();
    }
    togglePause() {
        const s = this.session;
        if (!s)
            return;
        if (s.phase === "recording")
            s.pause();
        else if (s.phase === "paused")
            s.resume();
        this.ui.refresh();
    }
    async stopRecording() {
        const s = this.session;
        if (!s || (s.phase !== "recording" && s.phase !== "paused"))
            return;
        try {
            const pending = s.stop(); // flips phase to "stopping" synchronously
            this.ui.refresh();
            const job = await pending;
            this.session = null;
            this.jobs.push(job);
            this.ui.refresh();
            void job.run();
        }
        catch (e) {
            this.session = null;
            new obsidian_1.Notice(`Recording failed: ${e.message}`, 8000);
            this.ui.refresh();
            this.updateKeepAwake();
        }
    }
    async cancelRecording() {
        const s = this.session;
        if (!s)
            return;
        await s.cancel();
        this.session = null;
        new obsidian_1.Notice("Recording discarded.");
        this.ui.refresh();
        this.updateKeepAwake();
    }
    onJobFinished(job) {
        this.ui.refresh();
        this.updateKeepAwake();
        window.setTimeout(() => {
            this.jobs = this.jobs.filter((j) => j !== job);
            this.ui.refresh();
        }, job.phase === "error" ? 8000 : 3500);
    }
    openSetup() {
        new setup_1.SetupModal(this.app, this).open();
    }
    /* ---------------- keep awake ---------------- */
    updateKeepAwake() {
        const busy = !!this.session || this.jobs.some((j) => j.phase !== "done" && j.phase !== "error");
        this.setKeepAwake(busy);
    }
    setKeepAwake(on) {
        if (on && this.settings.keepAwake && !this.caffeinate)
            this.caffeinate = (0, system_1.startCaffeinate)();
        if (!on && this.caffeinate) {
            this.caffeinate.kill();
            this.caffeinate = null;
        }
    }
    /* ---------------- settings ---------------- */
    async loadSettings() {
        var _a, _b;
        const data = (_a = (await this.loadData())) !== null && _a !== void 0 ? _a : {};
        this.settings = Object.assign({}, settings_1.DEFAULT_SETTINGS, data);
        // v2: built-in macOS capture replaces BlackHole auto-detect as the default system source.
        if (((_b = data.settingsVersion) !== null && _b !== void 0 ? _b : 1) < 2) {
            if (this.settings.systemDeviceId === "auto")
                this.settings.systemDeviceId = "native";
            this.settings.settingsVersion = 2;
            await this.saveSettings();
        }
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
}
exports.default = NoteRecorderPlugin;

},
"./native-audio": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeSystemAudio = exports.PERMISSION_HELP = exports.NativeAudioError = exports.HELPER_NAME = exports.HELPER_VERSION = void 0;
exports.nativeSupported = nativeSupported;
exports.helperPath = helperPath;
exports.helperBuilt = helperBuilt;
exports.canBuildHelper = canBuildHelper;
exports.buildHelper = buildHelper;
exports.openScreenRecordingSettings = openScreenRecordingSettings;
exports.testNative = testNative;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const system_1 = require("./system");
/**
 * Built-in macOS system-audio capture (no BlackHole, no Multi-Output Device).
 * A tiny Swift helper uses ScreenCaptureKit (macOS 13+) to capture everything the Mac plays
 * and streams mono Float32 PCM on stdout. It is compiled once on the user's Mac with the
 * Xcode Command Line Tools (already present when Homebrew is installed).
 */
exports.HELPER_VERSION = 1;
exports.HELPER_NAME = `nrt-system-audio-v${exports.HELPER_VERSION}`;
const SWIFT_SOURCE = String.raw `
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
function nativeSupported() {
    // Darwin 22 = macOS 13 Ventura
    return process.platform === "darwin" && parseInt(os.release().split(".")[0], 10) >= 22;
}
function helperPath(pluginDir) {
    return path.join(pluginDir, "bin", exports.HELPER_NAME);
}
function helperBuilt(pluginDir) {
    return fs.existsSync(helperPath(pluginDir));
}
/** True when the Xcode Command Line Tools (and thus `swiftc`) are installed. */
async function canBuildHelper() {
    if (process.platform !== "darwin")
        return false;
    const code = await (0, system_1.run)("/usr/bin/xcode-select", ["-p"]).catch(() => 1);
    return code === 0;
}
let building = null;
/** Compiles the helper (once). Resolves with the binary path. */
function buildHelper(pluginDir, onLine) {
    if (building)
        return building;
    building = (async () => {
        const out = helperPath(pluginDir);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        const src = path.join(os.tmpdir(), `${exports.HELPER_NAME}.swift`);
        fs.writeFileSync(src, SWIFT_SOURCE);
        const tail = [];
        const code = await (0, system_1.run)("/usr/bin/xcrun", ["swiftc", "-O", "-swift-version", "5", "-o", out + ".tmp", src], (l) => {
            tail.push(l);
            if (tail.length > 8)
                tail.shift();
            onLine === null || onLine === void 0 ? void 0 : onLine(l);
        });
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
class NativeAudioError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
    get isPermission() {
        return this.code === -3801 || /declin|permission|not authori[sz]ed|TCC/i.test(this.message);
    }
}
exports.NativeAudioError = NativeAudioError;
exports.PERMISSION_HELP = "Allow Obsidian in System Settings → Privacy & Security → Screen & System Audio Recording, then quit and reopen Obsidian.";
function openScreenRecordingSettings() {
    void (0, system_1.run)("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"]).catch(() => undefined);
}
/** Runs the helper and streams mono Float32 chunks to `onData`. */
class NativeSystemAudio {
    constructor(bin) {
        this.bin = bin;
        this.proc = null;
        this.rest = null;
        this.rate = 48000;
        this.onData = null;
    }
    start(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const done = (err) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                if (err) {
                    this.stop();
                    reject(err);
                }
                else
                    resolve(this.rate);
            };
            const timer = setTimeout(() => done(new NativeAudioError(-1, "System-audio capture did not start (macOS permission prompt pending?). " + exports.PERMISSION_HELP)), timeoutMs);
            const proc = (0, child_process_1.spawn)(this.bin, [], { env: (0, system_1.shellEnv)(), stdio: ["pipe", "pipe", "pipe"] });
            this.proc = proc;
            let errBuf = "";
            proc.stderr.on("data", (b) => {
                errBuf += b.toString();
                let i;
                while ((i = errBuf.indexOf("\n")) >= 0) {
                    const line = errBuf.slice(0, i).trim();
                    errBuf = errBuf.slice(i + 1);
                    const ready = line.match(/^READY (\d+)/);
                    const err = line.match(/^ERROR (-?\d+) (.*)$/);
                    if (ready) {
                        this.rate = Number(ready[1]);
                        done(null);
                    }
                    else if (err) {
                        const e = new NativeAudioError(Number(err[1]), err[2]);
                        if (e.isPermission)
                            e.message = "macOS blocked system-audio capture. " + exports.PERMISSION_HELP;
                        done(e);
                    }
                    else if (line)
                        console.debug("[note-recorder helper]", line);
                }
            });
            proc.stdout.on("data", (b) => this.handle(b));
            proc.on("error", (e) => done(e));
            proc.on("exit", (code) => {
                this.proc = null;
                done(new NativeAudioError(code !== null && code !== void 0 ? code : -1, `System-audio helper exited (code ${code}).`));
            });
        });
    }
    handle(chunk) {
        const buf = this.rest ? Buffer.concat([this.rest, chunk]) : chunk;
        const usable = buf.length - (buf.length % 4);
        this.rest = usable < buf.length ? Buffer.from(buf.subarray(usable)) : null;
        if (!usable || !this.onData)
            return;
        const f32 = new Float32Array(usable / 4);
        new Uint8Array(f32.buffer).set(buf.subarray(0, usable));
        this.onData(f32);
    }
    stop() {
        var _a;
        const p = this.proc;
        if (!p)
            return;
        this.proc = null;
        this.onData = null;
        try {
            (_a = p.stdin) === null || _a === void 0 ? void 0 : _a.end();
        }
        catch (_b) {
            /* ignore */
        }
        setTimeout(() => {
            if (p.exitCode === null)
                p.kill("SIGKILL");
        }, 2500);
    }
}
exports.NativeSystemAudio = NativeSystemAudio;
/** Listens for `ms` and returns the peak level (0..1) of captured system audio. */
async function testNative(bin, ms = 4000) {
    const cap = new NativeSystemAudio(bin);
    let peak = 0;
    cap.onData = (f) => {
        for (let i = 0; i < f.length; i++) {
            const v = Math.abs(f[i]);
            if (v > peak)
                peak = v;
        }
    };
    await cap.start();
    await new Promise((r) => setTimeout(r, ms));
    cap.stop();
    return peak;
}

},
"./note": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callout = callout;
exports.insertBlock = insertBlock;
exports.updateBlock = updateBlock;
exports.removeBlock = removeBlock;
/**
 * A recording occupies a block in the note delimited by invisible Obsidian comments:
 *   %%nrt:ID%% … %%/nrt:ID%%
 * The block is updated in place (recording → transcribing → final) and the markers
 * are removed once the final content is written.
 */
const open = (id) => `%%nrt:${id}%%`;
const close = (id) => `%%/nrt:${id}%%`;
const wrap = (id, body) => `${open(id)}\n${body}\n\n${close(id)}`;
function callout(type, title, lines = [], folded = false) {
    const head = `> [!${type}]${folded ? "-" : ""} ${title}`;
    return [head, ...lines.map((l) => (l ? `> ${l}` : ">"))].join("\n");
}
async function insertBlock(app, file, view, id, body, position) {
    const block = wrap(id, body);
    if (position === "cursor" && view && view.file === file && view.getMode() === "source") {
        const editor = view.editor;
        const cur = editor.getCursor();
        const line = editor.getLine(cur.line);
        const at = { line: cur.line, ch: line.length };
        editor.replaceRange((line.trim() ? "\n\n" : "") + block + "\n", at);
        return;
    }
    await app.vault.process(file, (data) => (data.trim() ? data.replace(/\s*$/, "") + "\n\n" : "") + block + "\n");
}
/** Replaces the block body. With `final`, the markers are dropped. Appends if the block was deleted by the user. */
async function updateBlock(app, file, id, body, final = false) {
    await app.vault.process(file, (data) => {
        const s = data.indexOf(open(id));
        const eIdx = data.indexOf(close(id));
        const replacement = final ? body : wrap(id, body);
        if (s < 0 || eIdx < s)
            return data.replace(/\s*$/, "") + "\n\n" + replacement + "\n";
        return data.slice(0, s) + replacement + data.slice(eIdx + close(id).length);
    });
}
async function removeBlock(app, file, id) {
    await app.vault.process(file, (data) => {
        const s = data.indexOf(open(id));
        const eIdx = data.indexOf(close(id));
        if (s < 0 || eIdx < s)
            return data;
        const before = data.slice(0, s).replace(/\n+$/, "");
        const after = data.slice(eIdx + close(id).length).replace(/^\n+/, "");
        return before && after ? `${before}\n\n${after}` : (before || after).replace(/\n*$/, "\n");
    });
}

},
"./recorder": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioRecorder = exports.TARGET_RATE = void 0;
exports.workletSource = workletSource;
const path = __importStar(require("path"));
const resampler_1 = require("./resampler");
const wav_1 = require("./wav");
const native_audio_1 = require("./native-audio");
exports.TARGET_RATE = 16000;
const TAP_NAME = "nrt-tap";
const FEED_NAME = "nrt-feed";
/** Chooses the best container MediaRecorder supports (m4a seeks better than webm). */
function pickMime() {
    const candidates = [
        ["audio/mp4;codecs=mp4a.40.2", "m4a"],
        ["audio/mp4", "m4a"],
        ["audio/webm;codecs=opus", "webm"],
        ["audio/webm", "webm"],
    ];
    for (const [mime, ext] of candidates)
        if (MediaRecorder.isTypeSupported(mime))
            return { mime, ext };
    return { mime: "", ext: "webm" };
}
/** AudioWorklet module: tap (split + resample + peaks) and feed (plays PCM pushed from the native helper). */
function workletSource() {
    return `
const Resampler = (${resampler_1.Resampler.toString()});
class NrtTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const target = options.processorOptions.targetRate;
    this.rs = [new Resampler(sampleRate, target), new Resampler(sampleRate, target)];
    this.out = [new Float32Array(8192), new Float32Array(8192)];
    this.len = 0;
    this.peak = [0, 0];
    this.flushAt = Math.round(target * 0.064);
    this.zeros = new Float32Array(128);
  }
  process(inputs) {
    const input = inputs[0] || [];
    const n = input[0] ? input[0].length : 128;
    if (this.zeros.length !== n) this.zeros = new Float32Array(n);
    const a = input[0] || this.zeros;
    const b = input[1] || this.zeros;
    for (let c = 0; c < 2; c++) {
      const x = c === 0 ? a : b; let p = this.peak[c];
      for (let i = 0; i < x.length; i++) { const v = x[i] < 0 ? -x[i] : x[i]; if (v > p) p = v; }
      this.peak[c] = p;
    }
    const next = this.rs[0].process(a, this.out[0], this.len);
    this.rs[1].process(b, this.out[1], this.len);
    this.len = next;
    if (this.len >= this.flushAt) {
      const mic = this.out[0].slice(0, this.len);
      const sys = this.out[1].slice(0, this.len);
      this.port.postMessage({ mic, sys, micPeak: this.peak[0], sysPeak: this.peak[1] }, [mic.buffer, sys.buffer]);
      this.len = 0; this.peak = [0, 0];
    }
    return true;
  }
}
registerProcessor("${TAP_NAME}", NrtTap);

class NrtFeed extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = []; this.off = 0; this.queued = 0; this.primed = false;
    this.prime = Math.round(sampleRate * 0.06);
    this.max = Math.round(sampleRate * 0.3);
    this.port.onmessage = (e) => {
      if (e.data === "flush") { this.q = []; this.off = 0; this.queued = 0; this.primed = false; return; }
      this.q.push(e.data); this.queued += e.data.length;
      while (this.queued > this.max && this.q.length > 1) {
        const d = this.q.shift(); this.queued -= d.length - this.off; this.off = 0;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!this.primed) { if (this.queued < this.prime) return true; this.primed = true; }
    let i = 0;
    while (i < out.length && this.q.length) {
      const h = this.q[0];
      const n = Math.min(out.length - i, h.length - this.off);
      out.set(h.subarray(this.off, this.off + n), i);
      i += n; this.off += n; this.queued -= n;
      if (this.off >= h.length) { this.q.shift(); this.off = 0; }
    }
    if (i < out.length) this.primed = false;
    return true;
  }
}
registerProcessor("${FEED_NAME}", NrtFeed);`;
}
class AudioRecorder {
    constructor(o) {
        this.o = o;
        this.ctx = null;
        this.streams = [];
        this.mediaRecorder = null;
        this.chunks = [];
        this.tap = null;
        this.micWriter = null;
        this.sysWriter = null;
        this.mixWriter = null;
        this.ext = "webm";
        this.startedAt = 0;
        this.pausedAt = 0;
        this.pausedTotal = 0;
        this.closed = false;
        this.native = null;
        this.feed = null;
        this.workletReady = false;
        this.hasSystem = false;
        /** Set when the requested system source could not be opened. */
        this.systemError = null;
    }
    get paused() {
        return this.pausedAt > 0;
    }
    get elapsedMs() {
        if (!this.startedAt)
            return 0;
        const now = this.pausedAt || performance.now();
        return Math.max(0, now - this.startedAt - this.pausedTotal);
    }
    async start() {
        var _a, _b;
        const o = this.o;
        const mic = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: o.micDeviceId && o.micDeviceId !== "default" ? { exact: o.micDeviceId } : undefined,
                echoCancellation: o.micEchoCancellation,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        this.streams.push(mic);
        let sys = null;
        if (((_a = o.system) === null || _a === void 0 ? void 0 : _a.kind) === "native") {
            const native = new native_audio_1.NativeSystemAudio(o.system.bin);
            try {
                await native.start();
                this.native = native;
            }
            catch (e) {
                this.systemError = e;
            }
        }
        else if (((_b = o.system) === null || _b === void 0 ? void 0 : _b.kind) === "device") {
            try {
                sys = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: { exact: o.system.deviceId },
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        channelCount: 2,
                    },
                });
                this.streams.push(sys);
            }
            catch (_c) {
                this.systemError = new Error("System audio device unavailable.");
            }
        }
        // Match the helper's rate so pushed PCM plays back at the right speed.
        const ctx = new AudioContext({ latencyHint: "interactive", sampleRate: this.native ? this.native.rate : undefined });
        this.ctx = ctx;
        if (ctx.state === "suspended")
            await ctx.resume();
        await this.loadWorklet(ctx);
        if (this.native && !this.workletReady) {
            this.native.stop();
            this.native = null;
            this.systemError = new Error("AudioWorklet unavailable — cannot use built-in system audio capture.");
        }
        this.hasSystem = !!sys || !!this.native;
        const merger = ctx.createChannelMerger(2);
        const recDest = ctx.createMediaStreamDestination();
        recDest.channelCount = 1;
        const micGain = this.monoGain(ctx, o.micGain);
        ctx.createMediaStreamSource(mic).connect(micGain);
        micGain.connect(merger, 0, 0);
        micGain.connect(recDest);
        if (this.hasSystem) {
            const sysGain = this.monoGain(ctx, o.systemGain);
            if (sys) {
                ctx.createMediaStreamSource(sys).connect(sysGain);
            }
            else {
                const feed = new AudioWorkletNode(ctx, FEED_NAME, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
                this.feed = feed;
                this.native.onData = (f32) => feed.port.postMessage(f32, [f32.buffer]);
                feed.connect(sysGain);
            }
            sysGain.connect(merger, 0, 1);
            sysGain.connect(recDest);
        }
        this.micWriter = new wav_1.WavWriter(path.join(o.workDir, "mic.wav"), exports.TARGET_RATE);
        this.mixWriter = new wav_1.WavWriter(path.join(o.workDir, "mix.wav"), exports.TARGET_RATE);
        if (this.hasSystem)
            this.sysWriter = new wav_1.WavWriter(path.join(o.workDir, "system.wav"), exports.TARGET_RATE);
        this.tap = this.createTap(ctx);
        merger.connect(this.tap);
        this.tap.connect(ctx.destination); // tap outputs silence; needed so the graph pulls it
        const { mime, ext } = pickMime();
        this.ext = ext;
        this.mediaRecorder = new MediaRecorder(recDest.stream, {
            mimeType: mime || undefined,
            audioBitsPerSecond: 96000,
        });
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size)
                this.chunks.push(e.data);
        };
        this.mediaRecorder.start(1000);
        this.startedAt = performance.now();
    }
    monoGain(ctx, value) {
        const g = ctx.createGain();
        g.gain.value = value;
        g.channelCount = 1;
        g.channelCountMode = "explicit";
        g.channelInterpretation = "speakers";
        return g;
    }
    async loadWorklet(ctx) {
        try {
            const url = URL.createObjectURL(new Blob([workletSource()], { type: "application/javascript" }));
            await ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            this.workletReady = true;
        }
        catch (e) {
            console.warn("[note-recorder] AudioWorklet unavailable", e);
        }
    }
    createTap(ctx) {
        if (this.workletReady) {
            const node = new AudioWorkletNode(ctx, TAP_NAME, {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [1],
                channelCount: 2,
                channelCountMode: "explicit",
                channelInterpretation: "discrete",
                processorOptions: { targetRate: exports.TARGET_RATE },
            });
            node.port.onmessage = (e) => this.handleChunk(e.data.mic, e.data.sys, e.data.micPeak, e.data.sysPeak);
            return node;
        }
        const sp = ctx.createScriptProcessor(4096, 2, 1);
        sp.channelInterpretation = "discrete";
        const rs = [new resampler_1.Resampler(ctx.sampleRate, exports.TARGET_RATE), new resampler_1.Resampler(ctx.sampleRate, exports.TARGET_RATE)];
        sp.onaudioprocess = (ev) => {
            const ib = ev.inputBuffer;
            const a = ib.getChannelData(0);
            const b = ib.numberOfChannels > 1 ? ib.getChannelData(1) : new Float32Array(a.length);
            const cap = Math.ceil(a.length / rs[0].ratio) + 4;
            const mo = new Float32Array(cap);
            const so = new Float32Array(cap);
            const n = rs[0].process(a, mo, 0);
            rs[1].process(b, so, 0);
            this.handleChunk(mo.subarray(0, n), so.subarray(0, n), peak(a), peak(b));
        };
        return sp;
    }
    handleChunk(mic, sys, micPeak, sysPeak) {
        var _a, _b, _c, _d;
        if (this.closed || this.paused)
            return;
        (_a = this.micWriter) === null || _a === void 0 ? void 0 : _a.write(mic);
        if (this.sysWriter)
            this.sysWriter.write(sys);
        const mix = new Float32Array(mic.length);
        for (let i = 0; i < mic.length; i++)
            mix[i] = mic[i] + (this.hasSystem ? sys[i] : 0);
        (_b = this.mixWriter) === null || _b === void 0 ? void 0 : _b.write(mix);
        (_d = (_c = this.o).onLevel) === null || _d === void 0 ? void 0 : _d.call(_c, micPeak, this.hasSystem ? sysPeak : -1);
    }
    pause() {
        var _a;
        if (!this.mediaRecorder || this.paused)
            return;
        this.mediaRecorder.pause();
        void ((_a = this.ctx) === null || _a === void 0 ? void 0 : _a.suspend());
        this.pausedAt = performance.now();
    }
    resume() {
        var _a, _b;
        if (!this.mediaRecorder || !this.paused)
            return;
        this.pausedTotal += performance.now() - this.pausedAt;
        this.pausedAt = 0;
        (_a = this.feed) === null || _a === void 0 ? void 0 : _a.port.postMessage("flush");
        void ((_b = this.ctx) === null || _b === void 0 ? void 0 : _b.resume());
        this.mediaRecorder.resume();
    }
    async stop() {
        var _a, _b, _c, _d;
        const durationMs = this.elapsedMs;
        const mr = this.mediaRecorder;
        const blob = await new Promise((resolve) => {
            const done = () => resolve(new Blob(this.chunks, { type: (mr === null || mr === void 0 ? void 0 : mr.mimeType) || "audio/webm" }));
            if (!mr || mr.state === "inactive")
                return done();
            mr.onstop = done;
            mr.stop();
        });
        const result = {
            blob,
            extension: this.ext,
            durationMs,
            micWav: this.micWriter.path,
            sysWav: (_b = (_a = this.sysWriter) === null || _a === void 0 ? void 0 : _a.path) !== null && _b !== void 0 ? _b : null,
            mixWav: this.mixWriter.path,
            micHasAudio: this.micWriter.hasAudio,
            sysHasAudio: (_d = (_c = this.sysWriter) === null || _c === void 0 ? void 0 : _c.hasAudio) !== null && _d !== void 0 ? _d : false,
        };
        await this.teardown();
        return result;
    }
    /** Releases devices without producing a result. */
    async cancel() {
        try {
            if (this.mediaRecorder && this.mediaRecorder.state !== "inactive")
                this.mediaRecorder.stop();
        }
        catch (_a) {
            /* ignore */
        }
        await this.teardown();
    }
    async teardown() {
        var _a, _b;
        this.closed = true;
        (_a = this.native) === null || _a === void 0 ? void 0 : _a.stop();
        this.native = null;
        (_b = this.feed) === null || _b === void 0 ? void 0 : _b.disconnect();
        if (this.tap) {
            if (this.tap instanceof AudioWorkletNode)
                this.tap.port.onmessage = null;
            if (this.tap instanceof ScriptProcessorNode)
                this.tap.onaudioprocess = null;
            this.tap.disconnect();
        }
        this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
        this.streams = [];
        [this.micWriter, this.sysWriter, this.mixWriter].forEach((w) => w === null || w === void 0 ? void 0 : w.close());
        if (this.ctx && this.ctx.state !== "closed")
            await this.ctx.close();
    }
}
exports.AudioRecorder = AudioRecorder;
function peak(x) {
    let p = 0;
    for (let i = 0; i < x.length; i++) {
        const v = Math.abs(x[i]);
        if (v > p)
            p = v;
    }
    return p;
}

},
"./resampler": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Resampler = void 0;
/**
 * Streaming resampler (e.g. 48 kHz -> 16 kHz) with a light 2-pole low-pass.
 * IMPORTANT: this class must stay self-contained (no imports, no helpers):
 * its source is injected verbatim into the AudioWorklet via toString().
 */
class Resampler {
    constructor(inRate, outRate) {
        this.ratio = inRate / outRate;
        this.t = 0;
        this.last = 0;
        this.lp1 = 0;
        this.lp2 = 0;
        this.tmp = null;
        const fc = Math.min(outRate, inRate) * 0.45;
        this.alpha = this.ratio > 1 ? 1 - Math.exp((-2 * Math.PI * fc) / inRate) : 1;
    }
    /** Resample `x` into `out` starting at `offset`. Returns the new write offset. */
    process(x, out, offset) {
        const n = x.length;
        if (!n)
            return offset;
        if (!this.tmp || this.tmp.length < n)
            this.tmp = new Float32Array(n);
        const y = this.tmp;
        const a = this.alpha;
        let l1 = this.lp1;
        let l2 = this.lp2;
        for (let i = 0; i < n; i++) {
            l1 += a * (x[i] - l1);
            l2 += a * (l1 - l2);
            y[i] = l2;
        }
        this.lp1 = l1;
        this.lp2 = l2;
        let o = offset;
        let t = this.t;
        while (t < n - 1 && o < out.length) {
            const i = Math.floor(t);
            const f = t - i;
            const s0 = i < 0 ? this.last : y[i];
            const s1 = y[i + 1];
            out[o++] = s0 + (s1 - s0) * f;
            t += this.ratio;
        }
        this.t = t - n;
        this.last = y[n - 1];
        return o;
    }
}
exports.Resampler = Resampler;

},
"./session": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingJob = exports.RecordingSession = void 0;
const obsidian_1 = require("obsidian");
const fs = __importStar(require("fs"));
const recorder_1 = require("./recorder");
const devices_1 = require("./devices");
const native_audio_1 = require("./native-audio");
const note_1 = require("./note");
const system_1 = require("./system");
const transcriber_1 = require("./transcriber");
const summarizer_1 = require("./summarizer");
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function stamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}
/* ------------------------------------------------------------------ */
/* Recording                                                          */
/* ------------------------------------------------------------------ */
class RecordingSession {
    constructor(plugin, file, view) {
        this.plugin = plugin;
        this.file = file;
        this.view = view;
        this.id = newId();
        this.startedAt = new Date();
        this.phase = "starting";
        this.recorder = null;
        this.workDir = (0, system_1.makeWorkDir)(this.id);
    }
    get elapsedMs() {
        var _a, _b;
        return (_b = (_a = this.recorder) === null || _a === void 0 ? void 0 : _a.elapsedMs) !== null && _b !== void 0 ? _b : 0;
    }
    get hasSystem() {
        var _a;
        return !!((_a = this.recorder) === null || _a === void 0 ? void 0 : _a.hasSystem);
    }
    async start() {
        var _a;
        const { app, settings: s } = this.plugin;
        await (0, note_1.insertBlock)(app, this.file, this.view, this.id, (0, note_1.callout)("danger", "🔴 Recording in progress…"), s.insertPosition);
        try {
            const system = await this.resolveSystem();
            if (s.micDeviceId === "default" && (await (0, devices_1.defaultInputIsLoopback)())) {
                new obsidian_1.Notice("Your macOS default input is a loopback device. Pick your real microphone in Note Recorder settings.", 8000);
            }
            this.recorder = new recorder_1.AudioRecorder({
                micDeviceId: s.micDeviceId,
                system,
                micEchoCancellation: s.micEchoCancellation,
                micGain: s.micGain,
                systemGain: s.systemGain,
                workDir: this.workDir,
                onLevel: (m, sy) => this.plugin.ui.onLevel(m, sy),
            });
            await this.recorder.start();
            const err = this.recorder.systemError;
            if (err) {
                new obsidian_1.Notice(`System audio not captured — recording microphone only.\n${err.message}`, 12000);
                if (err instanceof native_audio_1.NativeAudioError && err.isPermission)
                    (0, native_audio_1.openScreenRecordingSettings)();
            }
            else if (!system && s.systemDeviceId !== "none") {
                new obsidian_1.Notice("No system-audio source available — recording microphone only. Open the setup assistant.", 8000);
            }
            this.phase = "recording";
        }
        catch (e) {
            await ((_a = this.recorder) === null || _a === void 0 ? void 0 : _a.cancel());
            await (0, note_1.removeBlock)(app, this.file, this.id);
            (0, system_1.removeDir)(this.workDir);
            throw e;
        }
    }
    /** Turns the "System audio" setting into a concrete source, building the native helper if needed. */
    async resolveSystem() {
        const s = this.plugin.settings;
        if (s.systemDeviceId === "none")
            return null;
        if (s.systemDeviceId === "native") {
            if ((0, native_audio_1.nativeSupported)()) {
                const dir = this.plugin.pluginDir;
                if ((0, native_audio_1.helperBuilt)(dir))
                    return { kind: "native", bin: (0, native_audio_1.helperPath)(dir) };
                if (await (0, native_audio_1.canBuildHelper)()) {
                    const n = new obsidian_1.Notice("Preparing built-in system-audio capture (one time, ~30 s)…", 0);
                    try {
                        return { kind: "native", bin: await (0, native_audio_1.buildHelper)(dir) };
                    }
                    catch (e) {
                        new obsidian_1.Notice(e.message, 10000);
                    }
                    finally {
                        n.hide();
                    }
                }
                else {
                    new obsidian_1.Notice("Built-in system audio needs Xcode Command Line Tools — open the setup assistant.", 8000);
                }
            }
            const dev = await (0, devices_1.resolveSystemDevice)("auto"); // fallback: BlackHole if installed
            return dev ? { kind: "device", deviceId: dev.deviceId } : null;
        }
        const dev = await (0, devices_1.resolveSystemDevice)(s.systemDeviceId);
        return dev ? { kind: "device", deviceId: dev.deviceId } : null;
    }
    pause() {
        var _a;
        if (this.phase !== "recording")
            return;
        (_a = this.recorder) === null || _a === void 0 ? void 0 : _a.pause();
        this.phase = "paused";
    }
    resume() {
        var _a;
        if (this.phase !== "paused")
            return;
        (_a = this.recorder) === null || _a === void 0 ? void 0 : _a.resume();
        this.phase = "recording";
    }
    async stop() {
        this.phase = "stopping";
        const result = await this.recorder.stop();
        return new ProcessingJob(this.plugin, this.file, this.id, this.startedAt, this.workDir, result);
    }
    async cancel() {
        var _a;
        this.phase = "stopping";
        await ((_a = this.recorder) === null || _a === void 0 ? void 0 : _a.cancel());
        await (0, note_1.removeBlock)(this.plugin.app, this.file, this.id).catch(() => undefined);
        (0, system_1.removeDir)(this.workDir);
    }
}
exports.RecordingSession = RecordingSession;
/* ------------------------------------------------------------------ */
/* Post-processing: save audio → transcribe → summarise → write note  */
/* ------------------------------------------------------------------ */
class ProcessingJob {
    constructor(plugin, file, id, startedAt, workDir, rec) {
        this.plugin = plugin;
        this.file = file;
        this.id = id;
        this.startedAt = startedAt;
        this.workDir = workDir;
        this.rec = rec;
        this.phase = "saving";
        this.progress = 0; // 0..100
        this.message = "Saving audio…";
        this.embed = "";
    }
    set(phase, message, progress = this.progress) {
        this.phase = phase;
        this.message = message;
        this.progress = progress;
        this.plugin.ui.refresh();
    }
    async run() {
        const { app, settings: s } = this.plugin;
        try {
            const audio = await this.saveAudio();
            this.embed = "!" + app.fileManager.generateMarkdownLink(audio, this.file.path);
            await (0, note_1.updateBlock)(app, this.file, this.id, `${this.embed}\n\n${(0, note_1.callout)("info", "⏳ Transcribing…")}`);
            const bin = (0, system_1.findWhisper)(s.whisperPath);
            const model = (0, transcriber_1.modelPathFor)(this.plugin.modelsDir, s.whisperModel);
            if (!bin || !fs.existsSync(model)) {
                throw new Error("Transcription is not set up yet — open Settings → Note Recorder → Open setup.");
            }
            this.set("transcribing", "Transcribing…", 0);
            const paragraphs = await this.transcribe(bin, model);
            let summary = null;
            if (s.summaryEnabled && paragraphs.length) {
                this.set("summarizing", "Writing summary…", 100);
                try {
                    summary = await (0, summarizer_1.summarize)(s.ollamaUrl, s.ollamaModel, plain(paragraphs));
                }
                catch (e) {
                    console.warn("[note-recorder] summary skipped", e);
                }
            }
            await (0, note_1.updateBlock)(app, this.file, this.id, this.render(paragraphs, summary), true);
            this.set("done", paragraphs.length ? "Transcript added" : "No speech detected", 100);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[note-recorder]", e);
            this.set("error", msg);
            const body = [this.embed, (0, note_1.callout)("warning", "Transcription failed", [msg])].filter(Boolean).join("\n\n");
            await (0, note_1.updateBlock)(app, this.file, this.id, body, true).catch(() => undefined);
            new obsidian_1.Notice(`Note Recorder: ${msg}`, 8000);
        }
        finally {
            (0, system_1.removeDir)(this.workDir);
            this.plugin.onJobFinished(this);
        }
    }
    async saveAudio() {
        const { app, settings: s } = this.plugin;
        const name = `Recording ${stamp(this.startedAt)}.${this.rec.extension}`;
        let target;
        if (s.recordingsFolder) {
            const folder = (0, obsidian_1.normalizePath)(s.recordingsFolder);
            if (!app.vault.getAbstractFileByPath(folder))
                await app.vault.createFolder(folder);
            target = (0, obsidian_1.normalizePath)(`${folder}/${name}`);
        }
        else {
            target = await app.fileManager.getAvailablePathForAttachment(name, this.file.path);
        }
        return app.vault.createBinary(target, await this.rec.blob.arrayBuffer());
    }
    async transcribe(bin, model) {
        const s = this.plugin.settings;
        const r = this.rec;
        let tasks;
        if (s.labelSpeakers && r.sysWav && r.micHasAudio && r.sysHasAudio) {
            tasks = [
                { wav: r.micWav, speaker: s.micSpeakerName },
                { wav: r.sysWav, speaker: s.systemSpeakerName },
            ];
        }
        else if (r.micHasAudio || r.sysHasAudio) {
            tasks = [{ wav: r.mixWav }];
        }
        else {
            return [];
        }
        const all = [];
        for (let i = 0; i < tasks.length; i++) {
            const t = tasks[i];
            const label = tasks.length > 1 ? `Transcribing ${t.speaker}…` : "Transcribing…";
            this.set("transcribing", label, Math.round((i / tasks.length) * 100));
            const segs = await (0, transcriber_1.transcribeWav)(bin, model, t.wav, {
                language: s.language,
                threads: s.threads,
                onProgress: (p) => {
                    const overall = Math.round(((i + p / 100) / tasks.length) * 100);
                    if (overall !== this.progress)
                        this.set("transcribing", label, overall);
                },
            });
            segs.forEach((seg) => all.push({ ...seg, speaker: t.speaker }));
        }
        return (0, transcriber_1.toParagraphs)(all);
    }
    render(paragraphs, summary) {
        const s = this.plugin.settings;
        const parts = [this.embed];
        if (summary) {
            const lines = [summary.summary];
            if (summary.keyPoints.length)
                lines.push("", "**Key points**", ...summary.keyPoints.map((k) => `- ${k}`));
            if (summary.actionItems.length)
                lines.push("", "**Action items**", ...summary.actionItems.map((a) => `- [ ] ${a}`));
            parts.push((0, note_1.callout)("abstract", summary.title || "Summary", lines));
        }
        const speakers = [...new Set(paragraphs.map((p) => p.speaker).filter(Boolean))];
        const title = `Transcript · ${(0, transcriber_1.formatClock)(this.rec.durationMs)}${speakers.length ? " · " + speakers.join(" / ") : ""}`;
        const body = paragraphs.length
            ? paragraphs.flatMap((p, i) => {
                const ts = s.showTimestamps ? `\`${(0, transcriber_1.formatClock)(p.start)}\` ` : "";
                const who = p.speaker ? `**${p.speaker}:** ` : "";
                return i ? ["", `${ts}${who}${p.text}`] : [`${ts}${who}${p.text}`];
            })
            : ["*No speech detected.*"];
        parts.push((0, note_1.callout)("quote", title, body, s.transcriptFolded));
        return parts.join("\n\n");
    }
}
exports.ProcessingJob = ProcessingJob;
function plain(paragraphs) {
    return paragraphs.map((p) => (p.speaker ? `${p.speaker}: ${p.text}` : p.text)).join("\n");
}

},
"./settings": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecorderSettingTab = exports.DEFAULT_SETTINGS = void 0;
const obsidian_1 = require("obsidian");
const devices_1 = require("./devices");
const transcriber_1 = require("./transcriber");
const summarizer_1 = require("./summarizer");
const native_audio_1 = require("./native-audio");
exports.DEFAULT_SETTINGS = {
    recordingsFolder: "",
    insertPosition: "cursor",
    micDeviceId: "default",
    systemDeviceId: "native",
    micEchoCancellation: true,
    micGain: 1,
    systemGain: 1,
    whisperPath: "",
    whisperModel: "large-v3-turbo-q5_0",
    language: "auto",
    threads: 0,
    labelSpeakers: true,
    micSpeakerName: "Me",
    systemSpeakerName: "Others",
    showTimestamps: true,
    transcriptFolded: true,
    summaryEnabled: true,
    ollamaUrl: "http://127.0.0.1:11434",
    ollamaModel: "qwen3:4b",
    keepAwake: true,
    setupSeen: false,
    settingsVersion: 2,
};
const LANGUAGES = {
    auto: "Auto-detect",
    en: "English",
    fr: "French",
    de: "German",
    es: "Spanish",
    it: "Italian",
    nl: "Dutch",
    pt: "Portuguese",
    ja: "Japanese",
    zh: "Chinese",
};
const dB = (p) => (p > 0 ? `${(20 * Math.log10(p)).toFixed(0)} dB` : "-∞ dB");
/** Captures system audio briefly with the configured source and reports what was heard. */
async function testSystemAudio(plugin) {
    const s = plugin.settings;
    if (s.systemDeviceId === "none")
        return "System audio is set to Off.";
    let peak;
    let source;
    if (s.systemDeviceId === "native") {
        if (!(0, native_audio_1.nativeSupported)())
            throw new Error("Built-in capture needs macOS 13 or later — choose BlackHole instead.");
        const dir = plugin.pluginDir;
        if (!(0, native_audio_1.helperBuilt)(dir)) {
            if (!(await (0, native_audio_1.canBuildHelper)()))
                throw new Error("Install Xcode Command Line Tools first (setup assistant).");
            new obsidian_1.Notice("Preparing built-in capture (one time, ~30 s)…", 5000);
            await (0, native_audio_1.buildHelper)(dir);
        }
        peak = await (0, native_audio_1.testNative)((0, native_audio_1.helperPath)(dir));
        source = "Built-in macOS capture";
    }
    else {
        const dev = await (0, devices_1.resolveSystemDevice)(s.systemDeviceId);
        if (!dev)
            throw new Error("No loopback device (BlackHole) found.");
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: dev.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        peak = 0;
        const end = Date.now() + 4000;
        while (Date.now() < end) {
            an.getFloatTimeDomainData(buf);
            for (let i = 0; i < buf.length; i++)
                peak = Math.max(peak, Math.abs(buf[i]));
            await new Promise((r) => setTimeout(r, 40));
        }
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
        source = dev.label;
    }
    if (peak > 0.003)
        return `✅ ${source}: system audio received (peak ${dB(peak)}).`;
    return s.systemDeviceId === "native"
        ? `⚠️ ${source} is running but heard silence. Is something playing? If so, check Privacy & Security → Screen & System Audio Recording → Obsidian, then restart Obsidian.`
        : `⚠️ ${source} heard silence. Set System Settings → Sound → Output to a Multi-Output Device that includes ${source} — or switch to "Built-in macOS capture".`;
}
class RecorderSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.ollamaEl = null;
    }
    display() {
        void this.render();
    }
    async render() {
        const { containerEl } = this;
        const s = this.plugin.settings;
        const save = () => this.plugin.saveSettings();
        containerEl.empty();
        containerEl.addClass("nrt-settings");
        new obsidian_1.Setting(containerEl)
            .setName("Setup assistant")
            .setDesc("Checks microphone access, system audio, whisper.cpp, speech model and Ollama.")
            .addButton((b) => b.setButtonText("Open setup").setCta().onClick(() => this.plugin.openSetup()));
        new obsidian_1.Setting(containerEl).setName("Audio sources").setHeading();
        const devices = await (0, devices_1.listAudioInputs)().catch(() => []);
        const real = devices.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");
        new obsidian_1.Setting(containerEl)
            .setName("Microphone")
            .setDesc("Your voice. Avoid choosing a loopback device here.")
            .addDropdown((d) => {
            d.addOption("default", "System default");
            real.filter((x) => !devices_1.LOOPBACK_RE.test(x.label)).forEach((x) => d.addOption(x.deviceId, x.label || "Microphone"));
            d.setValue(s.micDeviceId).onChange(async (v) => {
                s.micDeviceId = v;
                await save();
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("System audio (Mac)")
            .setDesc("What your Mac plays (Zoom, Teams, browser…). Built-in capture needs no driver; macOS asks once for Screen & System Audio Recording permission.")
            .addDropdown((d) => {
            d.addOption("native", "Built-in macOS capture (recommended)");
            d.addOption("auto", "BlackHole / Loopback device (auto-detect)");
            d.addOption("none", "Off — microphone only");
            real.forEach((x) => d.addOption(x.deviceId, x.label || "Input"));
            d.setValue(s.systemDeviceId).onChange(async (v) => {
                s.systemDeviceId = v;
                await save();
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("Test system audio")
            .setDesc("Play something (e.g. a YouTube video), then click Test. Listens for 4 seconds.")
            .addButton((b) => b.setButtonText("Test").onClick(async () => {
            b.setDisabled(true).setButtonText("Listening…");
            try {
                new obsidian_1.Notice(await testSystemAudio(this.plugin), 10000);
            }
            catch (e) {
                new obsidian_1.Notice(`System audio test failed: ${e.message}`, 12000);
                if (e instanceof native_audio_1.NativeAudioError && e.isPermission)
                    (0, native_audio_1.openScreenRecordingSettings)();
            }
            finally {
                b.setDisabled(false).setButtonText("Test");
            }
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Microphone echo cancellation")
            .setDesc("Keep on when using speakers. Headphones give the cleanest speaker separation.")
            .addToggle((t) => t.setValue(s.micEchoCancellation).onChange(async (v) => {
            s.micEchoCancellation = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Microphone level")
            .addSlider((sl) => sl.setLimits(0.2, 3, 0.1).setValue(s.micGain).setDynamicTooltip().onChange(async (v) => {
            s.micGain = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("System audio level")
            .addSlider((sl) => sl.setLimits(0.2, 3, 0.1).setValue(s.systemGain).setDynamicTooltip().onChange(async (v) => {
            s.systemGain = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl).setName("Notes").setHeading();
        new obsidian_1.Setting(containerEl)
            .setName("Insert recording at")
            .addDropdown((d) => d
            .addOption("cursor", "Cursor position")
            .addOption("end", "End of note")
            .setValue(s.insertPosition)
            .onChange(async (v) => {
            s.insertPosition = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Recordings folder")
            .setDesc("Leave empty to follow Obsidian's attachment settings.")
            .addText((t) => t.setPlaceholder("Recordings").setValue(s.recordingsFolder).onChange(async (v) => {
            s.recordingsFolder = v.trim();
            await save();
        }));
        new obsidian_1.Setting(containerEl).setName("Transcription").setHeading();
        new obsidian_1.Setting(containerEl)
            .setName("Speech model")
            .setDesc("Downloaded once into the plugin folder. Runs offline on your Mac.")
            .addDropdown((d) => {
            transcriber_1.WHISPER_MODELS.forEach((m) => d.addOption(m.id, `${m.label} (${m.size})`));
            d.setValue(s.whisperModel).onChange(async (v) => {
                s.whisperModel = v;
                await save();
            });
        });
        new obsidian_1.Setting(containerEl).setName("Language").addDropdown((d) => {
            Object.entries(LANGUAGES).forEach(([k, v]) => d.addOption(k, v));
            d.setValue(s.language).onChange(async (v) => {
                s.language = v;
                await save();
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("Label speakers")
            .setDesc("Transcribe microphone and system audio separately and label who spoke.")
            .addToggle((t) => t.setValue(s.labelSpeakers).onChange(async (v) => {
            s.labelSpeakers = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Speaker names")
            .setDesc("Microphone / system audio")
            .addText((t) => t.setPlaceholder("Me").setValue(s.micSpeakerName).onChange(async (v) => {
            s.micSpeakerName = v || "Me";
            await save();
        }))
            .addText((t) => t.setPlaceholder("Others").setValue(s.systemSpeakerName).onChange(async (v) => {
            s.systemSpeakerName = v || "Others";
            await save();
        }));
        new obsidian_1.Setting(containerEl).setName("Show timestamps").addToggle((t) => t.setValue(s.showTimestamps).onChange(async (v) => {
            s.showTimestamps = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl).setName("Fold transcript callout").addToggle((t) => t.setValue(s.transcriptFolded).onChange(async (v) => {
            s.transcriptFolded = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("whisper.cpp binary")
            .setDesc("Leave empty to auto-detect Homebrew's whisper-cli.")
            .addText((t) => t.setPlaceholder("/opt/homebrew/bin/whisper-cli").setValue(s.whisperPath).onChange(async (v) => {
            s.whisperPath = v.trim();
            await save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("CPU threads")
            .setDesc("0 = automatic")
            .addText((t) => t.setValue(String(s.threads)).onChange(async (v) => {
            s.threads = Math.max(0, parseInt(v) || 0);
            await save();
        }));
        new obsidian_1.Setting(containerEl).setName("Summary (Ollama, optional)").setHeading();
        new obsidian_1.Setting(containerEl).setName("Generate title, summary, key points & action items").addToggle((t) => t.setValue(s.summaryEnabled).onChange(async (v) => {
            s.summaryEnabled = v;
            await save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Ollama URL")
            .setDesc("The model list below refreshes when you leave this field.")
            .addText((t) => {
            t.setValue(s.ollamaUrl).onChange(async (v) => {
                s.ollamaUrl = v.trim() || exports.DEFAULT_SETTINGS.ollamaUrl;
                await save();
            });
            t.inputEl.addEventListener("blur", () => void this.renderOllamaModel());
        });
        this.ollamaEl = containerEl.createDiv();
        void this.renderOllamaModel();
        new obsidian_1.Setting(containerEl).setName("Other").setHeading();
        new obsidian_1.Setting(containerEl)
            .setName("Keep Mac awake")
            .setDesc("Prevents idle sleep while recording and transcribing.")
            .addToggle((t) => t.setValue(s.keepAwake).onChange(async (v) => {
            s.keepAwake = v;
            await save();
        }));
    }
    /** Dropdown of every model installed in Ollama (falls back to a text field when Ollama is offline). */
    async renderOllamaModel() {
        const host = this.ollamaEl;
        if (!host)
            return;
        const s = this.plugin.settings;
        const save = () => this.plugin.saveSettings();
        host.empty();
        new obsidian_1.Setting(host).setName("Ollama model").setDesc("Loading installed models…");
        const models = await (0, summarizer_1.listOllamaModels)(s.ollamaUrl);
        if (host !== this.ollamaEl)
            return;
        host.empty();
        const setting = new obsidian_1.Setting(host).setName("Ollama model");
        if (models && models.length) {
            const current = (0, summarizer_1.matchInstalled)(models.map((m) => m.name), s.ollamaModel);
            setting
                .setDesc(`${models.length} model${models.length > 1 ? "s" : ""} installed in Ollama.`)
                .addDropdown((d) => {
                if (!current)
                    d.addOption(s.ollamaModel, `${s.ollamaModel} — not installed`);
                models.forEach((m) => d.addOption(m.name, (0, summarizer_1.modelLabel)(m)));
                d.setValue(current !== null && current !== void 0 ? current : s.ollamaModel).onChange(async (v) => {
                    s.ollamaModel = v;
                    await save();
                    void this.renderOllamaModel();
                });
            });
            if (current && current !== s.ollamaModel) {
                s.ollamaModel = current;
                await save();
            }
        }
        else {
            setting
                .setDesc(models
                ? "Ollama is running but has no models. Download one from the setup assistant, then refresh."
                : "Ollama is not reachable — start Ollama, then refresh. You can still type a model name.")
                .addText((t) => t.setPlaceholder("qwen3:4b").setValue(s.ollamaModel).onChange(async (v) => {
                s.ollamaModel = v.trim() || exports.DEFAULT_SETTINGS.ollamaModel;
                await save();
            }));
        }
        setting.addExtraButton((b) => b.setIcon("refresh-cw").setTooltip("Refresh model list").onClick(() => void this.renderOllamaModel()));
    }
}
exports.RecorderSettingTab = RecorderSettingTab;

},
"./setup": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupModal = void 0;
const obsidian_1 = require("obsidian");
const fs = __importStar(require("fs"));
const devices_1 = require("./devices");
const system_1 = require("./system");
const transcriber_1 = require("./transcriber");
const summarizer_1 = require("./summarizer");
const native_audio_1 = require("./native-audio");
const SUGGESTED = [
    { name: "qwen3:4b", size: "~2.6 GB" },
    { name: "qwen3:8b", size: "~5.2 GB" },
];
/** Guided, terminal-free setup (mirrors the "Install what is missing" flow of Lecture Transcriber). */
class SetupModal extends obsidian_1.Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this.rows = {};
        this.busy = new Set();
        this.lastDraw = 0;
    }
    onOpen() {
        this.modalEl.addClass("nrt-setup");
        this.titleEl.setText("Note Recorder — setup");
        this.contentEl.createEl("p", { cls: "nrt-setup-intro", text: "Everything runs locally on your Mac. Nothing is uploaded." });
        this.listEl = this.contentEl.createDiv({ cls: "nrt-setup-list" });
        const footer = this.contentEl.createDiv({ cls: "nrt-setup-footer" });
        footer.createEl("button", { text: "Re-check" }).addEventListener("click", () => void this.check());
        footer.createEl("button", { text: "Done", cls: "mod-cta" }).addEventListener("click", () => this.close());
        void this.check();
    }
    async check() {
        const s = this.plugin.settings;
        if (!obsidian_1.Platform.isMacOS) {
            this.rows.os = { status: "optional", title: "macOS", desc: "System-audio capture targets macOS. Microphone recording works everywhere." };
        }
        // 1. Microphone permission
        let micOk = false;
        try {
            const st = await navigator.mediaDevices.getUserMedia({ audio: true });
            st.getTracks().forEach((t) => t.stop());
            micOk = true;
        }
        catch (_a) {
            /* denied */
        }
        this.rows.mic = micOk
            ? { status: "ok", title: "Microphone access", desc: "Granted." }
            : {
                status: "missing",
                title: "Microphone access",
                desc: "Allow Obsidian in System Settings → Privacy & Security → Microphone, then restart Obsidian.",
                actions: [{ label: "Open privacy settings", run: () => void (0, system_1.run)("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"]) }],
            };
        // 2a. Built-in system audio (ScreenCaptureKit helper)
        const dir = this.plugin.pluginDir;
        if (!this.busy.has("native")) {
            const want = s.systemDeviceId === "native";
            if (!(0, native_audio_1.nativeSupported)()) {
                this.rows.native = { status: "optional", title: "Built-in system audio", desc: "Requires macOS 13 Ventura or later — use BlackHole below." };
            }
            else if ((0, native_audio_1.helperBuilt)(dir)) {
                this.rows.native = {
                    status: want ? "ok" : "optional",
                    title: "Built-in system audio",
                    desc: "Ready. On first recording, allow Obsidian under Screen & System Audio Recording, then restart Obsidian.",
                    actions: [{ label: "Permission settings", run: () => (0, native_audio_1.openScreenRecordingSettings)() }],
                };
            }
            else if (await (0, native_audio_1.canBuildHelper)()) {
                this.rows.native = {
                    status: want ? "missing" : "optional",
                    title: "Built-in system audio",
                    desc: "Compiles a tiny local helper (one time, ~30 s) that captures your Mac's audio via ScreenCaptureKit.",
                    actions: [{ label: "Prepare", cta: true, run: () => void this.buildNative() }],
                };
            }
            else {
                this.rows.native = {
                    status: want ? "missing" : "optional",
                    title: "Built-in system audio",
                    desc: "Needs Apple's Command Line Tools (free). Install, then press Re-check.",
                    actions: [{ label: "Install tools", cta: true, run: () => void (0, system_1.run)("/usr/bin/xcode-select", ["--install"]) }],
                };
            }
        }
        // 2b. BlackHole (alternative)
        const inputs = await (0, devices_1.listAudioInputs)().catch(() => []);
        const loop = inputs.find((d) => d.deviceId !== "default" && devices_1.LOOPBACK_RE.test(d.label));
        this.rows.system = loop
            ? {
                status: s.systemDeviceId === "native" ? "optional" : "ok",
                title: "Loopback device — alternative",
                desc: `Found “${loop.label}”. Route output through a Multi-Output Device to use it.`,
                actions: [{ label: "Audio MIDI Setup", run: () => (0, system_1.openApp)("Audio MIDI Setup") }],
            }
            : {
                status: s.systemDeviceId === "native" || s.systemDeviceId === "none" ? "optional" : "missing",
                title: "BlackHole — alternative",
                desc: "Only needed if built-in capture isn't available.",
                actions: [{ label: "Install BlackHole", run: () => (0, system_1.runInTerminal)("brew install --cask blackhole-2ch && echo '✅ Done — restart Obsidian'") }],
            };
        // 3. whisper.cpp
        const whisper = (0, system_1.findWhisper)(s.whisperPath);
        const brew = (0, system_1.findBrew)();
        if (!this.busy.has("whisper")) {
            this.rows.whisper = whisper
                ? { status: "ok", title: "Speech engine (whisper.cpp)", desc: whisper }
                : brew
                    ? {
                        status: "missing",
                        title: "Speech engine (whisper.cpp)",
                        desc: "Installs Homebrew's whisper-cpp (uses Apple Silicon GPU via Metal).",
                        actions: [{ label: "Install", cta: true, run: () => void this.installWhisper(brew) }],
                    }
                    : {
                        status: "missing",
                        title: "Speech engine (whisper.cpp)",
                        desc: "Homebrew is required. Install it from brew.sh, then press Re-check.",
                        actions: [{ label: "Open brew.sh", run: () => window.open("https://brew.sh") }],
                    };
        }
        // 4. Speech model
        const model = (0, transcriber_1.getModel)(s.whisperModel);
        if (!this.busy.has("model")) {
            this.rows.model = fs.existsSync((0, transcriber_1.modelPathFor)(this.plugin.modelsDir, model.id))
                ? { status: "ok", title: "Speech model", desc: model.label }
                : {
                    status: "missing",
                    title: "Speech model",
                    desc: `${model.label} — ${model.size}. Change the model in settings.`,
                    actions: [{ label: "Download", cta: true, run: () => void this.downloadModel() }],
                };
        }
        // 5. Ollama (optional) — pick any installed model, or download a suggested one
        if (!this.busy.has("ollama"))
            this.rows.ollama = await this.ollamaRow();
        this.draw();
    }
    async ollamaRow() {
        const s = this.plugin.settings;
        const title = "Summaries (Ollama)";
        if (!s.summaryEnabled)
            return { status: "optional", title, desc: "Disabled in settings." };
        const models = await (0, summarizer_1.listOllamaModels)(s.ollamaUrl);
        if (!models) {
            return {
                status: "optional",
                title: `${title} — optional`,
                desc: "Install and open Ollama to get a title, summary, key points and action items.",
                actions: [{ label: "Get Ollama", run: () => window.open("https://ollama.com/download") }],
            };
        }
        const names = models.map((m) => m.name);
        const current = (0, summarizer_1.matchInstalled)(names, s.ollamaModel);
        const downloads = SUGGESTED.filter((m) => !(0, summarizer_1.matchInstalled)(names, m.name)).map((m, i) => ({
            label: `Download ${m.name} (${m.size})`,
            cta: !models.length && i === 0,
            run: () => void this.pullOllama(m.name),
        }));
        if (!models.length) {
            return { status: "missing", title, desc: "Ollama is running but has no models yet. Download one:", actions: downloads };
        }
        return {
            status: current ? "ok" : "missing",
            title,
            desc: current
                ? `${models.length} model${models.length > 1 ? "s" : ""} installed. Choose which one writes your summaries.`
                : `“${s.ollamaModel}” is not installed. Choose one of your installed models:`,
            picker: {
                label: "Model",
                placeholder: current ? undefined : "Choose a model…",
                options: models.map((m) => ({ value: m.name, label: (0, summarizer_1.modelLabel)(m) })),
                value: current !== null && current !== void 0 ? current : "",
                onChange: async (v) => {
                    s.ollamaModel = v;
                    await this.plugin.saveSettings();
                    this.rows.ollama = await this.ollamaRow();
                    this.draw();
                },
            },
            actions: downloads,
        };
    }
    async buildNative() {
        this.busy.add("native");
        const row = { status: "working", title: "Built-in system audio", desc: "Compiling helper…", progress: null, log: "" };
        this.rows.native = row;
        this.draw();
        try {
            await (0, native_audio_1.buildHelper)(this.plugin.pluginDir, (l) => {
                row.log = l;
                this.draw();
            });
        }
        catch (e) {
            row.log = e.message;
        }
        this.busy.delete("native");
        await this.check();
    }
    async installWhisper(brew) {
        this.busy.add("whisper");
        const row = { status: "working", title: "Speech engine (whisper.cpp)", desc: "Installing with Homebrew…", progress: null, log: "" };
        this.rows.whisper = row;
        this.draw();
        const code = await (0, system_1.run)(brew, ["install", "whisper-cpp"], (l) => {
            row.log = l;
            this.draw();
        }).catch(() => 1);
        this.busy.delete("whisper");
        if (code !== 0)
            row.desc = "Install failed — run `brew install whisper-cpp` in Terminal.";
        await this.check();
    }
    async downloadModel() {
        const model = (0, transcriber_1.getModel)(this.plugin.settings.whisperModel);
        this.busy.add("model");
        const row = { status: "working", title: "Speech model", desc: `Downloading ${model.label}…`, progress: 0 };
        this.rows.model = row;
        this.draw();
        try {
            await (0, system_1.downloadFile)((0, transcriber_1.modelUrl)(model), (0, transcriber_1.modelPathFor)(this.plugin.modelsDir, model.id), (got, total) => {
                row.progress = total ? got / total : null;
                row.log = total ? `${(0, system_1.formatBytes)(got)} / ${(0, system_1.formatBytes)(total)}` : (0, system_1.formatBytes)(got);
                this.drawThrottled();
            });
        }
        catch (e) {
            row.log = `Failed: ${e.message}`;
        }
        this.busy.delete("model");
        await this.check();
    }
    async pullOllama(name) {
        this.busy.add("ollama");
        const row = { status: "working", title: "Summaries (Ollama)", desc: `Downloading ${name}…`, progress: null };
        this.rows.ollama = row;
        this.draw();
        try {
            await (0, system_1.postNdjson)(`${this.plugin.settings.ollamaUrl.replace(/\/$/, "")}/api/pull`, { model: name, stream: true }, (o) => {
                var _a;
                if (o.total && o.completed)
                    row.progress = o.completed / o.total;
                row.log = (_a = o.status) !== null && _a !== void 0 ? _a : "";
                this.drawThrottled();
            });
            this.plugin.settings.ollamaModel = name;
            await this.plugin.saveSettings();
        }
        catch (e) {
            row.log = `Failed: ${e.message}`;
        }
        this.busy.delete("ollama");
        await this.check();
    }
    drawThrottled() {
        const now = Date.now();
        if (now - this.lastDraw > 150) {
            this.lastDraw = now;
            this.draw();
        }
    }
    draw() {
        var _a, _b;
        this.listEl.empty();
        for (const row of Object.values(this.rows)) {
            const r = this.listEl.createDiv({ cls: `nrt-setup-row is-${row.status}` });
            const icon = r.createDiv({ cls: "nrt-setup-icon" });
            if (row.status === "working")
                icon.createSpan({ cls: "nrt-spinner" });
            else
                (0, obsidian_1.setIcon)(icon, row.status === "ok" ? "check-circle-2" : row.status === "missing" ? "circle-dashed" : "minus-circle");
            const body = r.createDiv({ cls: "nrt-setup-body" });
            body.createDiv({ cls: "nrt-setup-title", text: row.title });
            body.createDiv({ cls: "nrt-setup-desc", text: row.desc });
            if (row.picker) {
                const p = row.picker;
                const wrap = body.createDiv({ cls: "nrt-setup-picker" });
                wrap.createSpan({ cls: "nrt-setup-picker-label", text: p.label });
                const sel = wrap.createEl("select", { cls: "dropdown" });
                if (p.placeholder) {
                    const o = sel.createEl("option", { text: p.placeholder });
                    o.value = "";
                    o.disabled = true;
                }
                for (const opt of p.options) {
                    const o = sel.createEl("option", { text: opt.label });
                    o.value = opt.value;
                }
                sel.value = p.value;
                sel.addEventListener("change", () => sel.value && p.onChange(sel.value));
            }
            if (row.status === "working") {
                const track = body.createDiv({ cls: "nrt-track" + (row.progress == null ? " nrt-indeterminate" : "") });
                track.createDiv({ cls: "nrt-fill" }).style.width = `${Math.round(((_a = row.progress) !== null && _a !== void 0 ? _a : 1) * 100)}%`;
            }
            if (row.log)
                body.createDiv({ cls: "nrt-setup-log", text: row.log });
            if ((_b = row.actions) === null || _b === void 0 ? void 0 : _b.length) {
                const a = r.createDiv({ cls: "nrt-setup-actions" });
                row.actions.forEach((act) => a.createEl("button", { text: act.label, cls: act.cta ? "mod-cta" : "" }).addEventListener("click", act.run));
            }
        }
    }
    onClose() {
        this.contentEl.empty();
    }
}
exports.SetupModal = SetupModal;

},
"./summarizer": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOllamaModels = listOllamaModels;
exports.modelLabel = modelLabel;
exports.matchInstalled = matchInstalled;
exports.summarize = summarize;
const obsidian_1 = require("obsidian");
const system_1 = require("./system");
const MAX_CHARS = 60000;
const PROMPT = (transcript) => `You are given the transcript of a recording (a meeting, call or lecture).
Write in the SAME LANGUAGE as the transcript. Return ONLY a JSON object with these keys:
- "title": a short, specific title (max 8 words)
- "summary": 2-4 sentences describing what was discussed and concluded
- "keyPoints": 3-8 concise bullet strings with the most important points, facts or decisions
- "actionItems": bullet strings of concrete follow-ups with owner if mentioned (empty array if none)

Transcript:
"""
${transcript.length > MAX_CHARS ? transcript.slice(0, MAX_CHARS) + "\n[…truncated]" : transcript}
"""`;
/** Returns every model installed in Ollama, or null when Ollama is not reachable. */
async function listOllamaModels(baseUrl) {
    var _a;
    try {
        const res = await (0, obsidian_1.requestUrl)({ url: `${baseUrl.replace(/\/$/, "")}/api/tags`, throw: false });
        if (res.status !== 200)
            return null;
        return ((_a = res.json.models) !== null && _a !== void 0 ? _a : [])
            .map((m) => {
            var _a, _b, _c;
            return ({
                name: String((_a = m.name) !== null && _a !== void 0 ? _a : m.model),
                size: Number((_b = m.size) !== null && _b !== void 0 ? _b : 0),
                parameterSize: ((_c = m.details) === null || _c === void 0 ? void 0 : _c.parameter_size) ? String(m.details.parameter_size) : undefined,
            });
        })
            .filter((m) => !!m.name)
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    catch (_b) {
        return null;
    }
}
/** "qwen3:8b  (8.2B · 5.20 GB)" */
function modelLabel(m) {
    const meta = [m.parameterSize, m.size ? (0, system_1.formatBytes)(m.size) : ""].filter(Boolean).join(" · ");
    return meta ? `${m.name}  (${meta})` : m.name;
}
/** Matches "llama3" to "llama3:latest" etc. Returns the installed name or null. */
function matchInstalled(names, wanted) {
    if (names.includes(wanted))
        return wanted;
    if (!wanted.includes(":") && names.includes(`${wanted}:latest`))
        return `${wanted}:latest`;
    if (wanted.endsWith(":latest") && names.includes(wanted.slice(0, -7)))
        return wanted.slice(0, -7);
    return null;
}
async function summarize(baseUrl, model, transcript) {
    var _a, _b, _c, _d, _e;
    const res = await (0, obsidian_1.requestUrl)({
        url: `${baseUrl.replace(/\/$/, "")}/api/generate`,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({
            model,
            prompt: PROMPT(transcript),
            stream: false,
            format: "json",
            think: false,
            options: { temperature: 0.2, num_ctx: 32768 },
        }),
        throw: false,
    });
    if (res.status !== 200)
        throw new Error(`Ollama returned HTTP ${res.status}`);
    const raw = String((_a = res.json.response) !== null && _a !== void 0 ? _a : "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const list = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
    return {
        title: String((_b = parsed.title) !== null && _b !== void 0 ? _b : "").trim(),
        summary: String((_c = parsed.summary) !== null && _c !== void 0 ? _c : "").trim(),
        keyPoints: list((_d = parsed.keyPoints) !== null && _d !== void 0 ? _d : parsed.key_points),
        actionItems: list((_e = parsed.actionItems) !== null && _e !== void 0 ? _e : parsed.action_items),
    };
}

},
"./system": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBrew = exports.findWhisper = void 0;
exports.shellEnv = shellEnv;
exports.findExecutable = findExecutable;
exports.makeWorkDir = makeWorkDir;
exports.removeDir = removeDir;
exports.run = run;
exports.runInTerminal = runInTerminal;
exports.openApp = openApp;
exports.startCaffeinate = startCaffeinate;
exports.downloadFile = downloadFile;
exports.postNdjson = postNdjson;
exports.formatBytes = formatBytes;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/** GUI apps on macOS don't inherit the shell PATH, so Homebrew locations are added explicitly. */
const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin", "/bin", "/usr/sbin"];
function shellEnv() {
    const env = { ...process.env };
    env.PATH = [...EXTRA_PATH, env.PATH || ""].join(":");
    env.HOMEBREW_NO_AUTO_UPDATE = "1";
    env.HOMEBREW_NO_INSTALL_CLEANUP = "1";
    return env;
}
function findExecutable(names, override) {
    if (override && fs.existsSync(override))
        return override;
    const dirs = [...EXTRA_PATH, ...(process.env.PATH || "").split(":")].filter(Boolean);
    for (const dir of dirs) {
        for (const name of names) {
            const p = path.join(dir, name);
            if (fs.existsSync(p))
                return p;
        }
    }
    return null;
}
const findWhisper = (override) => findExecutable(["whisper-cli", "whisper-cpp"], override);
exports.findWhisper = findWhisper;
const findBrew = () => findExecutable(["brew"]);
exports.findBrew = findBrew;
function makeWorkDir(id) {
    const dir = path.join(os.tmpdir(), "obsidian-note-recorder", id);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function removeDir(dir) {
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    catch (_a) {
        /* ignore */
    }
}
/** Runs a command, streaming combined output lines to `onLine`. Resolves with the exit code. */
function run(cmd, args, onLine, signal) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(cmd, args, { env: shellEnv() });
        const feed = (buf) => buf.toString().split(/\r?\n|\r/).forEach((l) => l.trim() && (onLine === null || onLine === void 0 ? void 0 : onLine(l)));
        child.stdout.on("data", feed);
        child.stderr.on("data", feed);
        child.on("error", reject);
        child.on("close", (code) => resolve(code !== null && code !== void 0 ? code : 1));
        signal === null || signal === void 0 ? void 0 : signal.addEventListener("abort", () => child.kill("SIGTERM"));
    });
}
/** Opens Terminal.app with a command (for installs that need a sudo password, e.g. BlackHole). */
function runInTerminal(command) {
    const escaped = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    (0, child_process_1.spawn)("osascript", ["-e", `tell application "Terminal" to activate`, "-e", `tell application "Terminal" to do script "${escaped}"`], {
        env: shellEnv(),
        detached: true,
    });
}
function openApp(name) {
    (0, child_process_1.spawn)("open", ["-a", name], { env: shellEnv(), detached: true });
}
/** Prevents idle sleep while recording / transcribing (macOS `caffeinate`). */
function startCaffeinate() {
    try {
        return (0, child_process_1.spawn)("/usr/bin/caffeinate", ["-i", "-m"], { env: shellEnv() });
    }
    catch (_a) {
        return null;
    }
}
/** Streaming download with redirect support and progress; writes to `<dest>.part` then renames. */
function downloadFile(url, dest, onProgress, signal, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 10)
            return reject(new Error("Too many redirects"));
        const mod = url.startsWith("https:") ? https : http;
        const req = mod.get(url, { headers: { "User-Agent": "obsidian-note-recorder" } }, (res) => {
            var _a;
            const status = (_a = res.statusCode) !== null && _a !== void 0 ? _a : 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                const next = new URL(res.headers.location, url).toString();
                downloadFile(next, dest, onProgress, signal, redirects + 1).then(resolve, reject);
                return;
            }
            if (status !== 200) {
                res.resume();
                return reject(new Error(`Download failed (HTTP ${status})`));
            }
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const part = dest + ".part";
            const file = fs.createWriteStream(part);
            const total = Number(res.headers["content-length"] || 0);
            let received = 0;
            res.on("data", (c) => {
                received += c.length;
                onProgress(received, total);
            });
            res.pipe(file);
            file.on("finish", () => file.close(() => {
                fs.renameSync(part, dest);
                resolve();
            }));
            const fail = (e) => {
                file.destroy();
                fs.rmSync(part, { force: true });
                reject(e);
            };
            res.on("error", fail);
            file.on("error", fail);
            signal === null || signal === void 0 ? void 0 : signal.addEventListener("abort", () => {
                req.destroy();
                fail(new Error("Cancelled"));
            });
        });
        req.on("error", reject);
    });
}
/** POSTs JSON and invokes `onJson` for each newline-delimited JSON object in the response (Ollama streaming). */
function postNdjson(url, body, onJson) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const mod = u.protocol === "https:" ? https : http;
        const data = JSON.stringify(body);
        const req = mod.request(u, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
            let buf = "";
            res.on("data", (c) => {
                buf += c.toString();
                let i;
                while ((i = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, i).trim();
                    buf = buf.slice(i + 1);
                    if (line) {
                        try {
                            onJson(JSON.parse(line));
                        }
                        catch (_a) {
                            /* partial line */
                        }
                    }
                }
            });
            res.on("end", () => (res.statusCode && res.statusCode >= 400 ? reject(new Error(`HTTP ${res.statusCode}`)) : resolve()));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.write(data);
        req.end();
    });
}
function formatBytes(n) {
    if (n > 1e9)
        return (n / 1e9).toFixed(2) + " GB";
    if (n > 1e6)
        return (n / 1e6).toFixed(0) + " MB";
    return (n / 1e3).toFixed(0) + " KB";
}

},
"./transcriber": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModel = exports.modelUrl = exports.WHISPER_MODELS = void 0;
exports.transcribeWav = transcribeWav;
exports.toParagraphs = toParagraphs;
exports.formatClock = formatClock;
exports.modelPathFor = modelPathFor;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const system_1 = require("./system");
exports.WHISPER_MODELS = [
    { id: "base", file: "ggml-base.bin", size: "~150 MB", label: "Base — fastest, rough quality" },
    { id: "small", file: "ggml-small.bin", size: "~490 MB", label: "Small — fast, good for English" },
    { id: "large-v3-turbo-q5_0", file: "ggml-large-v3-turbo-q5_0.bin", size: "~570 MB", label: "Large v3 Turbo (q5) — best balance, multilingual (recommended)" },
    { id: "large-v3-turbo", file: "ggml-large-v3-turbo.bin", size: "~1.6 GB", label: "Large v3 Turbo — highest quality" },
];
const modelUrl = (m) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${m.file}`;
exports.modelUrl = modelUrl;
const getModel = (id) => { var _a; return (_a = exports.WHISPER_MODELS.find((m) => m.id === id)) !== null && _a !== void 0 ? _a : exports.WHISPER_MODELS[2]; };
exports.getModel = getModel;
const NOISE_RE = /^[\s.]*([\[(（【♪*].*[\])）】♪*])?[\s.]*$/;
/** Runs whisper.cpp on a 16 kHz mono WAV and returns timestamped segments. */
async function transcribeWav(bin, modelPath, wav, o) {
    var _a, _b, _c, _d, _e, _f;
    const outBase = wav.replace(/\.wav$/, "");
    const threads = o.threads > 0 ? o.threads : Math.max(2, Math.min(8, os.cpus().length - 2));
    const args = ["-m", modelPath, "-f", wav, "-l", o.language || "auto", "-t", String(threads), "-oj", "-of", outBase, "-pp"];
    const tail = [];
    const code = await (0, system_1.run)(bin, args, (line) => {
        var _a;
        const m = line.match(/progress\s*=\s*(\d+)%/);
        if (m)
            (_a = o.onProgress) === null || _a === void 0 ? void 0 : _a.call(o, Number(m[1]));
        tail.push(line);
        if (tail.length > 12)
            tail.shift();
    }, o.signal);
    const jsonPath = outBase + ".json";
    if (code !== 0 || !fs.existsSync(jsonPath)) {
        throw new Error(`whisper.cpp failed (exit ${code}): ${tail.slice(-3).join(" | ")}`);
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const segments = [];
    let prev = "";
    for (const s of (_a = data.transcription) !== null && _a !== void 0 ? _a : []) {
        const text = String((_b = s.text) !== null && _b !== void 0 ? _b : "").trim();
        if (!text || NOISE_RE.test(text) || text === prev)
            continue; // drop [BLANK_AUDIO], (music), repeats
        prev = text;
        segments.push({ start: (_d = (_c = s.offsets) === null || _c === void 0 ? void 0 : _c.from) !== null && _d !== void 0 ? _d : 0, end: (_f = (_e = s.offsets) === null || _e === void 0 ? void 0 : _e.to) !== null && _f !== void 0 ? _f : 0, text });
    }
    return segments;
}
/** Merges segments (optionally from several speakers) into readable paragraphs. */
function toParagraphs(segments) {
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const out = [];
    let cur = null;
    for (const s of sorted) {
        const sameSpeaker = cur && cur.speaker === s.speaker;
        const closeInTime = cur && s.start - cur.end < 2500;
        if (cur && sameSpeaker && closeInTime && cur.text.length < 700) {
            cur.text += " " + s.text;
            cur.end = Math.max(cur.end, s.end);
        }
        else {
            if (cur)
                out.push(cur);
            cur = { start: s.start, end: s.end, speaker: s.speaker, text: s.text };
        }
    }
    if (cur)
        out.push(cur);
    return out.map(({ start, speaker, text }) => ({ start, speaker, text }));
}
function formatClock(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function modelPathFor(modelsDir, id) {
    return path.join(modelsDir, (0, exports.getModel)(id).file);
}

},
"./ui": function (module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoteUI = void 0;
const obsidian_1 = require("obsidian");
const transcriber_1 = require("./transcriber");
const WAVE_BARS = 48;
/** Sets exactly one icon inside `el` (clears anything previously rendered there). */
function putIcon(el, icon) {
    el.empty();
    (0, obsidian_1.setIcon)(el, icon);
    // Some Obsidian versions append instead of replacing — keep only the last SVG.
    const svgs = el.querySelectorAll("svg");
    for (let i = 0; i < svgs.length - 1; i++)
        svgs[i].remove();
}
/** Owns every piece of recording UI: header buttons, in-note bar, ribbon and status bar. */
class NoteUI {
    constructor(plugin, ribbonEl, statusEl) {
        this.plugin = plugin;
        this.ribbonEl = ribbonEl;
        this.statusEl = statusEl;
        this.actions = new Map();
        this.bars = new Map();
        this.ticker = null;
        this.ribbonIcon = "";
        this.statusEl.addClass("nrt-status");
        this.statusEl.addEventListener("click", () => this.plugin.toggleRecording());
    }
    refresh() {
        var _a;
        const views = this.plugin.app.workspace
            .getLeavesOfType("markdown")
            .map((l) => l.view)
            .filter((v) => v instanceof obsidian_1.MarkdownView);
        for (const [v, a] of this.actions)
            if (!views.includes(v)) {
                a.destroy();
                this.actions.delete(v);
            }
        for (const [v, bar] of this.bars)
            if (!views.includes(v)) {
                bar.destroy();
                this.bars.delete(v);
            }
        const session = this.plugin.session;
        for (const v of views) {
            let action = this.actions.get(v);
            if (!action || !action.el.isConnected) {
                action === null || action === void 0 ? void 0 : action.destroy();
                action = new HeaderAction(this.plugin, v);
                this.actions.set(v, action);
            }
            action.render();
            const path = (_a = v.file) === null || _a === void 0 ? void 0 : _a.path;
            const job = path ? this.plugin.jobs.find((j) => j.file.path === path) : undefined;
            const wants = !!path && ((session === null || session === void 0 ? void 0 : session.file.path) === path || !!job);
            let bar = this.bars.get(v);
            if (bar && (!wants || bar.path !== path)) {
                bar.destroy();
                this.bars.delete(v);
                bar = undefined;
            }
            if (wants && !bar) {
                bar = new RecordingBar(v.contentEl, this.plugin, path);
                this.bars.set(v, bar);
            }
            bar === null || bar === void 0 ? void 0 : bar.render();
        }
        this.renderRibbon();
        this.renderStatus();
        this.ensureTicker();
    }
    /** Called ~15×/s by the recorder with peak levels (0..1). sys = -1 when not captured. */
    onLevel(mic, sys) {
        var _a;
        const path = (_a = this.plugin.session) === null || _a === void 0 ? void 0 : _a.file.path;
        for (const bar of this.bars.values())
            if (bar.path === path)
                bar.pushLevel(mic, sys);
    }
    get isRecording() {
        var _a;
        const p = (_a = this.plugin.session) === null || _a === void 0 ? void 0 : _a.phase;
        return p === "recording" || p === "paused";
    }
    renderRibbon() {
        const icon = this.isRecording ? "square" : "mic";
        this.ribbonEl.toggleClass("nrt-recording", this.isRecording);
        if (icon !== this.ribbonIcon) {
            this.ribbonIcon = icon;
            putIcon(this.ribbonEl, icon);
        }
        this.ribbonEl.setAttr("aria-label", this.isRecording ? "Stop recording" : "Start recording in current note");
    }
    renderStatus() {
        const session = this.plugin.session;
        const job = this.plugin.jobs.find((j) => j.phase === "transcribing" || j.phase === "summarizing" || j.phase === "saving");
        this.statusEl.empty();
        this.statusEl.toggleClass("nrt-status-rec", this.isRecording);
        if (session && this.isRecording) {
            this.statusEl.createSpan({ cls: "nrt-dot" });
            this.statusEl.createSpan({ text: `${session.phase === "paused" ? "PAUSED" : "REC"} ${(0, transcriber_1.formatClock)(session.elapsedMs)}` });
            this.statusEl.setAttr("aria-label", "Click to stop recording");
        }
        else if (job) {
            this.statusEl.setText(`${job.message} ${job.phase === "transcribing" ? job.progress + "%" : ""}`.trim());
            this.statusEl.removeAttribute("aria-label");
        }
    }
    ensureTicker() {
        const needs = !!this.plugin.session;
        if (needs && this.ticker === null) {
            this.ticker = window.setInterval(() => this.tick(), 250);
        }
        else if (!needs && this.ticker !== null) {
            window.clearInterval(this.ticker);
            this.ticker = null;
        }
    }
    tick() {
        for (const a of this.actions.values())
            a.tick();
        for (const bar of this.bars.values())
            bar.tick();
        this.renderStatus();
    }
    destroy() {
        if (this.ticker !== null)
            window.clearInterval(this.ticker);
        this.actions.forEach((a) => a.destroy());
        this.bars.forEach((b) => b.destroy());
        this.actions.clear();
        this.bars.clear();
    }
}
exports.NoteUI = NoteUI;
/**
 * Header button. Uses a fixed DOM structure (one icon slot + one time slot) that is
 * updated in place, so the icon can never be rendered twice.
 */
class HeaderAction {
    constructor(plugin, view) {
        this.plugin = plugin;
        this.icon = "";
        // Remove leftovers (e.g. after a plugin reload) so only one button exists per view.
        view.containerEl.querySelectorAll(".nrt-action").forEach((n) => n.remove());
        this.el = view.addAction("mic", "Start recording", () => this.plugin.toggleRecording(view));
        this.el.addClass("nrt-action");
        this.el.empty(); // drop the icon Obsidian injected; we manage children ourselves
        this.iconEl = this.el.createSpan({ cls: "nrt-action-icon" });
        this.timeEl = this.el.createSpan({ cls: "nrt-action-time" });
    }
    render() {
        const session = this.plugin.session;
        const phase = session === null || session === void 0 ? void 0 : session.phase;
        this.el.toggleClass("nrt-recording", phase === "recording");
        this.el.toggleClass("nrt-paused", phase === "paused");
        this.el.toggleClass("nrt-busy", phase === "starting" || phase === "stopping");
        const icon = !session ? "mic" : phase === "paused" ? "pause" : phase === "recording" ? "square" : "loader";
        if (icon !== this.icon) {
            this.icon = icon;
            putIcon(this.iconEl, icon);
        }
        this.timeEl.toggle(!!session);
        this.el.setAttr("aria-label", session ? "Stop recording" : "Start recording");
        this.tick();
    }
    tick() {
        const session = this.plugin.session;
        if (session)
            this.timeEl.setText((0, transcriber_1.formatClock)(session.elapsedMs));
    }
    destroy() {
        this.el.remove();
    }
}
/** Floating toolbar shown inside the note that is being recorded / transcribed. */
class RecordingBar {
    constructor(host, plugin, path) {
        this.host = host;
        this.plugin = plugin;
        this.path = path;
        this.key = "";
        this.timeEl = null;
        this.canvas = null;
        this.micFill = null;
        this.sysFill = null;
        this.progressFill = null;
        this.progressText = null;
        this.history = new Float32Array(WAVE_BARS);
        this.drawPending = false;
        host.addClass("nrt-host");
        this.el = host.createDiv({ cls: "nrt-bar" });
        this.el.setAttr("role", "status");
    }
    render() {
        var _a;
        const session = ((_a = this.plugin.session) === null || _a === void 0 ? void 0 : _a.file.path) === this.path ? this.plugin.session : null;
        const job = this.plugin.jobs.find((j) => j.file.path === this.path);
        const key = session ? `rec:${session.phase}:${session.hasSystem}` : job ? `job:${job.phase}` : "none";
        if (key !== this.key) {
            this.key = key;
            this.build();
        }
        this.tick();
    }
    build() {
        var _a;
        const el = this.el;
        el.empty();
        this.timeEl = this.canvas = this.micFill = this.sysFill = this.progressFill = this.progressText = null;
        const session = ((_a = this.plugin.session) === null || _a === void 0 ? void 0 : _a.file.path) === this.path ? this.plugin.session : null;
        const job = this.plugin.jobs.find((j) => j.file.path === this.path);
        el.dataset.state = session ? session.phase : job ? job.phase : "none";
        if (session) {
            if (session.phase === "starting" || session.phase === "stopping") {
                el.createSpan({ cls: "nrt-spinner" });
                el.createSpan({ cls: "nrt-label", text: session.phase === "starting" ? "Starting microphone…" : "Saving recording…" });
                return;
            }
            const rec = el.createDiv({ cls: "nrt-rec" });
            rec.createSpan({ cls: "nrt-dot" });
            rec.createSpan({ cls: "nrt-rec-label", text: session.phase === "paused" ? "Paused" : "REC" });
            this.timeEl = rec.createSpan({ cls: "nrt-time" });
            this.canvas = el.createEl("canvas", { cls: "nrt-wave" });
            const meters = el.createDiv({ cls: "nrt-meters" });
            this.micFill = this.meter(meters, "mic", "Microphone");
            if (session.hasSystem)
                this.sysFill = this.meter(meters, "monitor-speaker", "System audio");
            else {
                const off = meters.createDiv({ cls: "nrt-meter nrt-meter-off", attr: { "aria-label": "System audio not captured" } });
                putIcon(off.createSpan({ cls: "nrt-meter-icon" }), "volume-x");
            }
            const btns = el.createDiv({ cls: "nrt-buttons" });
            this.button(btns, session.phase === "paused" ? "play" : "pause", session.phase === "paused" ? "Resume" : "Pause", "", () => this.plugin.togglePause());
            this.button(btns, "square", "Stop & transcribe", "nrt-stop", () => this.plugin.stopRecording(), "Stop");
            this.button(btns, "x", "Discard recording", "nrt-discard", () => this.plugin.cancelRecording());
            this.draw();
            return;
        }
        if (job) {
            if (job.phase === "done" || job.phase === "error") {
                putIcon(el.createSpan({ cls: "nrt-result-icon" }), job.phase === "done" ? "check-circle-2" : "alert-triangle");
                el.createSpan({ cls: "nrt-label", text: job.phase === "done" ? job.message : "Transcription failed" });
                return;
            }
            el.createSpan({ cls: "nrt-spinner" });
            const wrap = el.createDiv({ cls: "nrt-progress" });
            this.progressText = wrap.createSpan({ cls: "nrt-label" });
            const track = wrap.createDiv({ cls: "nrt-track" });
            this.progressFill = track.createDiv({ cls: "nrt-fill" });
            if (job.phase !== "transcribing")
                track.addClass("nrt-indeterminate");
        }
    }
    tick() {
        var _a;
        const session = ((_a = this.plugin.session) === null || _a === void 0 ? void 0 : _a.file.path) === this.path ? this.plugin.session : null;
        if (session && this.timeEl)
            this.timeEl.setText((0, transcriber_1.formatClock)(session.elapsedMs));
        const job = this.plugin.jobs.find((j) => j.file.path === this.path);
        if (job && this.progressText) {
            this.progressText.setText(job.phase === "transcribing" ? `${job.message} ${job.progress}%` : job.message);
            if (this.progressFill)
                this.progressFill.style.width = `${job.phase === "transcribing" ? job.progress : 100}%`;
        }
    }
    pushLevel(mic, sys) {
        const level = Math.max(mic, sys);
        this.history.copyWithin(0, 1);
        this.history[WAVE_BARS - 1] = Math.min(1, level);
        const curve = (v) => `${Math.round(Math.min(1, Math.pow(Math.max(0, v), 0.5)) * 100)}%`;
        if (this.micFill)
            this.micFill.style.width = curve(mic);
        if (this.sysFill)
            this.sysFill.style.width = curve(sys);
        if (!this.drawPending) {
            this.drawPending = true;
            window.requestAnimationFrame(() => {
                this.drawPending = false;
                this.draw();
            });
        }
    }
    draw() {
        var _a;
        const c = this.canvas;
        if (!c)
            return;
        const dpr = window.devicePixelRatio || 1;
        const w = c.clientWidth || 140;
        const h = c.clientHeight || 32;
        if (c.width !== w * dpr) {
            c.width = w * dpr;
            c.height = h * dpr;
        }
        const g = c.getContext("2d");
        if (!g)
            return;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        g.fillStyle = ((_a = this.plugin.session) === null || _a === void 0 ? void 0 : _a.phase) === "paused" ? "rgba(255,255,255,0.28)" : "#f24822";
        const step = w / WAVE_BARS;
        const bw = Math.max(1.5, step * 0.55);
        for (let i = 0; i < WAVE_BARS; i++) {
            const v = Math.pow(this.history[i], 0.55);
            const bh = Math.max(2, v * (h - 2));
            g.globalAlpha = 0.35 + 0.65 * (i / WAVE_BARS);
            const x = i * step + (step - bw) / 2;
            const y = (h - bh) / 2;
            g.beginPath();
            if (typeof g.roundRect === "function")
                g.roundRect(x, y, bw, bh, bw / 2);
            else
                g.rect(x, y, bw, bh);
            g.fill();
        }
        g.globalAlpha = 1;
    }
    meter(parent, icon, label) {
        const m = parent.createDiv({ cls: "nrt-meter", attr: { "aria-label": label } });
        putIcon(m.createSpan({ cls: "nrt-meter-icon" }), icon);
        return m.createDiv({ cls: "nrt-track" }).createDiv({ cls: "nrt-fill" });
    }
    button(parent, icon, label, cls, onClick, text) {
        const b = parent.createEl("button", { cls: `nrt-btn ${cls}`.trim(), attr: { "aria-label": label } });
        putIcon(b.createSpan({ cls: "nrt-btn-icon" }), icon);
        if (text)
            b.createSpan({ text });
        b.addEventListener("click", (e) => {
            e.preventDefault();
            onClick();
        });
    }
    destroy() {
        this.el.remove();
        if (!this.host.querySelector(".nrt-bar"))
            this.host.removeClass("nrt-host");
    }
}

},
"./wav": function (module, exports, require) {
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WavWriter = void 0;
const fs = __importStar(require("fs"));
/** Streams 16-bit mono PCM to a WAV file on disk (memory-safe for long recordings). */
class WavWriter {
    constructor(path, rate) {
        this.path = path;
        this.rate = rate;
        this.dataBytes = 0;
        this.pending = [];
        this.pendingBytes = 0;
        this.activeSamples = 0;
        this.closed = false;
        this.fd = fs.openSync(path, "w");
        fs.writeSync(this.fd, this.header(0));
    }
    write(samples) {
        if (this.closed || !samples.length)
            return;
        const pcm = new Int16Array(samples.length);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            sum += s * s;
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Crude voice-activity tracking (-40 dBFS) used to skip silent channels.
        if (Math.sqrt(sum / samples.length) > 0.01)
            this.activeSamples += samples.length;
        const buf = Buffer.from(pcm.buffer);
        this.pending.push(buf);
        this.pendingBytes += buf.length;
        this.dataBytes += buf.length;
        if (this.pendingBytes > 64 * 1024)
            this.flush();
    }
    /** True when the channel contains at least ~1.5 s of non-silent audio. */
    get hasAudio() {
        return this.activeSamples / this.rate >= 1.5;
    }
    flush() {
        if (!this.pending.length)
            return;
        fs.writeSync(this.fd, Buffer.concat(this.pending));
        this.pending = [];
        this.pendingBytes = 0;
    }
    close() {
        if (this.closed)
            return;
        this.flush();
        fs.writeSync(this.fd, this.header(this.dataBytes), 0, 44, 0);
        fs.closeSync(this.fd);
        this.closed = true;
    }
    header(dataBytes) {
        const b = Buffer.alloc(44);
        b.write("RIFF", 0);
        b.writeUInt32LE(36 + dataBytes, 4);
        b.write("WAVE", 8);
        b.write("fmt ", 12);
        b.writeUInt32LE(16, 16);
        b.writeUInt16LE(1, 20); // PCM
        b.writeUInt16LE(1, 22); // mono
        b.writeUInt32LE(this.rate, 24);
        b.writeUInt32LE(this.rate * 2, 28);
        b.writeUInt16LE(2, 32);
        b.writeUInt16LE(16, 34);
        b.write("data", 36);
        b.writeUInt32LE(dataBytes, 40);
        return b;
    }
}
exports.WavWriter = WavWriter;

}
};
var __nrt_cache = {};
function __nrt_require(id) {
  if (!id.startsWith("./")) return require(id);
  if (__nrt_cache[id]) return __nrt_cache[id].exports;
  var m = __nrt_cache[id] = { exports: {} };
  __nrt_modules[id].call(m.exports, m, m.exports, __nrt_require);
  return m.exports;
}
module.exports = __nrt_require("./main");
