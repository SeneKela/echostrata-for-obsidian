/**
 * Streaming resampler (e.g. 48 kHz -> 16 kHz) with a light 2-pole low-pass.
 * IMPORTANT: this class must stay self-contained (no imports, no helpers):
 * its source is injected verbatim into the AudioWorklet via toString().
 */
export class Resampler {
	ratio: number;
	t: number;
	last: number;
	lp1: number;
	lp2: number;
	alpha: number;
	tmp: Float32Array | null;

	constructor(inRate: number, outRate: number) {
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
	process(x: Float32Array, out: Float32Array, offset: number): number {
		const n = x.length;
		if (!n) return offset;
		if (!this.tmp || this.tmp.length < n) this.tmp = new Float32Array(n);
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
