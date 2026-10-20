import * as fs from "fs";

/** Streams 16-bit mono PCM to a WAV file on disk (memory-safe for long recordings). */
export class WavWriter {
	private fd: number;
	private dataBytes = 0;
	private pending: Buffer[] = [];
	private pendingBytes = 0;
	private activeSamples = 0;
	private closed = false;

	constructor(public readonly path: string, private readonly rate: number) {
		this.fd = fs.openSync(path, "w");
		fs.writeSync(this.fd, this.header(0));
	}

	write(samples: Float32Array): void {
		if (this.closed || !samples.length) return;
		const pcm = new Int16Array(samples.length);
		let sum = 0;
		for (let i = 0; i < samples.length; i++) {
			const s = Math.max(-1, Math.min(1, samples[i]));
			sum += s * s;
			pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}
		// Crude voice-activity tracking (-40 dBFS) used to skip silent channels.
		if (Math.sqrt(sum / samples.length) > 0.01) this.activeSamples += samples.length;
		const buf = Buffer.from(pcm.buffer);
		this.pending.push(buf);
		this.pendingBytes += buf.length;
		this.dataBytes += buf.length;
		if (this.pendingBytes > 64 * 1024) this.flush();
	}

	/** True when the channel contains at least ~1.5 s of non-silent audio. */
	get hasAudio(): boolean {
		return this.activeSamples / this.rate >= 1.5;
	}

	private flush(): void {
		if (!this.pending.length) return;
		fs.writeSync(this.fd, Buffer.concat(this.pending));
		this.pending = [];
		this.pendingBytes = 0;
	}

	close(): void {
		if (this.closed) return;
		this.flush();
		fs.writeSync(this.fd, this.header(this.dataBytes), 0, 44, 0);
		fs.closeSync(this.fd);
		this.closed = true;
	}

	private header(dataBytes: number): Buffer {
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
