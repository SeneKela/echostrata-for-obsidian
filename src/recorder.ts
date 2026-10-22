import * as path from "path";
import { Resampler } from "./resampler";
import { WavWriter } from "./wav";
import { NativeSystemAudio } from "./native-audio";

export const TARGET_RATE = 16000;
const TAP_NAME = "nrt-tap";
const FEED_NAME = "nrt-feed";

/** Where system audio comes from: an input device (BlackHole…) or the native ScreenCaptureKit helper. */
export type SystemSource = { kind: "device"; deviceId: string } | { kind: "native"; bin: string } | null;

export interface RecorderOptions {
	micDeviceId: string; // "default" or a deviceId
	system: SystemSource; // null = mic only
	micEchoCancellation: boolean;
	micGain: number;
	systemGain: number;
	workDir: string;
	onLevel?: (mic: number, sys: number) => void; // sys = -1 when no system source
}

export interface RecorderResult {
	blob: Blob;
	extension: string;
	durationMs: number;
	micWav: string;
	sysWav: string | null;
	mixWav: string;
	micHasAudio: boolean;
	sysHasAudio: boolean;
}

/** Chooses the best container MediaRecorder supports (m4a seeks better than webm). */
function pickMime(): { mime: string; ext: string } {
	const candidates: Array<[string, string]> = [
		["audio/mp4;codecs=mp4a.40.2", "m4a"],
		["audio/mp4", "m4a"],
		["audio/webm;codecs=opus", "webm"],
		["audio/webm", "webm"],
	];
	for (const [mime, ext] of candidates) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
	return { mime: "", ext: "webm" };
}

/** AudioWorklet module: tap (split + resample + peaks) and feed (plays PCM pushed from the native helper). */
export function workletSource(): string {
	return `
const Resampler = (${Resampler.toString()});
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

export class AudioRecorder {
	private ctx: AudioContext | null = null;
	private streams: MediaStream[] = [];
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private tap: AudioNode | null = null;
	private micWriter: WavWriter | null = null;
	private sysWriter: WavWriter | null = null;
	private mixWriter: WavWriter | null = null;
	private ext = "webm";
	private startedAt = 0;
	private pausedAt = 0;
	private pausedTotal = 0;
	private closed = false;
	private native: NativeSystemAudio | null = null;
	private feed: AudioWorkletNode | null = null;
	private workletReady = false;
	hasSystem = false;
	/** Set when the requested system source could not be opened. */
	systemError: Error | null = null;

	constructor(private readonly o: RecorderOptions) {}

	get paused(): boolean {
		return this.pausedAt > 0;
	}

	get elapsedMs(): number {
		if (!this.startedAt) return 0;
		const now = this.pausedAt || performance.now();
		return Math.max(0, now - this.startedAt - this.pausedTotal);
	}

	async start(): Promise<void> {
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

		let sys: MediaStream | null = null;
		if (o.system?.kind === "native") {
			const native = new NativeSystemAudio(o.system.bin);
			try {
				await native.start();
				this.native = native;
			} catch (e) {
				this.systemError = e as Error;
			}
		} else if (o.system?.kind === "device") {
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
			} catch {
				this.systemError = new Error("System audio device unavailable.");
			}
		}

		// Match the helper's rate so pushed PCM plays back at the right speed.
		const ctx = new AudioContext({ latencyHint: "interactive", sampleRate: this.native ? this.native.rate : undefined });
		this.ctx = ctx;
		if (ctx.state === "suspended") await ctx.resume();
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
			} else {
				const feed = new AudioWorkletNode(ctx, FEED_NAME, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
				this.feed = feed;
				this.native!.onData = (f32) => feed.port.postMessage(f32, [f32.buffer]);
				feed.connect(sysGain);
			}
			sysGain.connect(merger, 0, 1);
			sysGain.connect(recDest);
		}

		this.micWriter = new WavWriter(path.join(o.workDir, "mic.wav"), TARGET_RATE);
		this.mixWriter = new WavWriter(path.join(o.workDir, "mix.wav"), TARGET_RATE);
		if (this.hasSystem) this.sysWriter = new WavWriter(path.join(o.workDir, "system.wav"), TARGET_RATE);

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
			if (e.data && e.data.size) this.chunks.push(e.data);
		};
		this.mediaRecorder.start(1000);
		this.startedAt = performance.now();
	}

	private monoGain(ctx: AudioContext, value: number): GainNode {
		const g = ctx.createGain();
		g.gain.value = value;
		g.channelCount = 1;
		g.channelCountMode = "explicit";
		g.channelInterpretation = "speakers";
		return g;
	}

	private async loadWorklet(ctx: AudioContext): Promise<void> {
		try {
			const url = URL.createObjectURL(new Blob([workletSource()], { type: "application/javascript" }));
			await ctx.audioWorklet.addModule(url);
			URL.revokeObjectURL(url);
			this.workletReady = true;
		} catch (e) {
			console.warn("[note-recorder] AudioWorklet unavailable", e);
		}
	}

	private createTap(ctx: AudioContext): AudioNode {
		if (this.workletReady) {
			const node = new AudioWorkletNode(ctx, TAP_NAME, {
				numberOfInputs: 1,
				numberOfOutputs: 1,
				outputChannelCount: [1],
				channelCount: 2,
				channelCountMode: "explicit",
				channelInterpretation: "discrete",
				processorOptions: { targetRate: TARGET_RATE },
			});
			node.port.onmessage = (e: MessageEvent<{ mic: Float32Array; sys: Float32Array; micPeak: number; sysPeak: number }>) =>
				this.handleChunk(e.data.mic, e.data.sys, e.data.micPeak, e.data.sysPeak);
			return node;
		}
		const sp = ctx.createScriptProcessor(4096, 2, 1);
		sp.channelInterpretation = "discrete";
		const rs = [new Resampler(ctx.sampleRate, TARGET_RATE), new Resampler(ctx.sampleRate, TARGET_RATE)];
		sp.onaudioprocess = (ev: AudioProcessingEvent) => {
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

	private handleChunk(mic: Float32Array, sys: Float32Array, micPeak: number, sysPeak: number): void {
		if (this.closed || this.paused) return;
		this.micWriter?.write(mic);
		if (this.sysWriter) this.sysWriter.write(sys);
		const mix = new Float32Array(mic.length);
		for (let i = 0; i < mic.length; i++) mix[i] = mic[i] + (this.hasSystem ? sys[i] : 0);
		this.mixWriter?.write(mix);
		this.o.onLevel?.(micPeak, this.hasSystem ? sysPeak : -1);
	}

	pause(): void {
		if (!this.mediaRecorder || this.paused) return;
		this.mediaRecorder.pause();
		void this.ctx?.suspend();
		this.pausedAt = performance.now();
	}

	resume(): void {
		if (!this.mediaRecorder || !this.paused) return;
		this.pausedTotal += performance.now() - this.pausedAt;
		this.pausedAt = 0;
		this.feed?.port.postMessage("flush");
		void this.ctx?.resume();
		this.mediaRecorder.resume();
	}

	async stop(): Promise<RecorderResult> {
		const durationMs = this.elapsedMs;
		const mr = this.mediaRecorder;
		const blob = await new Promise<Blob>((resolve) => {
			const done = () => resolve(new Blob(this.chunks, { type: mr?.mimeType || "audio/webm" }));
			if (!mr || mr.state === "inactive") return done();
			mr.onstop = done;
			mr.stop();
		});
		const result: RecorderResult = {
			blob,
			extension: this.ext,
			durationMs,
			micWav: this.micWriter!.path,
			sysWav: this.sysWriter?.path ?? null,
			mixWav: this.mixWriter!.path,
			micHasAudio: this.micWriter!.hasAudio,
			sysHasAudio: this.sysWriter?.hasAudio ?? false,
		};
		await this.teardown();
		return result;
	}

	/** Releases devices without producing a result. */
	async cancel(): Promise<void> {
		try {
			if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
		} catch {
			/* ignore */
		}
		await this.teardown();
	}

	private async teardown(): Promise<void> {
		this.closed = true;
		this.native?.stop();
		this.native = null;
		this.feed?.disconnect();
		if (this.tap) {
			if (this.tap instanceof AudioWorkletNode) this.tap.port.onmessage = null;
			if (this.tap instanceof ScriptProcessorNode) this.tap.onaudioprocess = null;
			this.tap.disconnect();
		}
		this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
		this.streams = [];
		[this.micWriter, this.sysWriter, this.mixWriter].forEach((w) => w?.close());
		if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
	}
}

function peak(x: Float32Array): number {
	let p = 0;
	for (let i = 0; i < x.length; i++) {
		const v = Math.abs(x[i]);
		if (v > p) p = v;
	}
	return p;
}
