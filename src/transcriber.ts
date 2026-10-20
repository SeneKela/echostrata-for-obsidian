import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { run } from "./system";

export interface WhisperModel {
	id: string;
	file: string;
	size: string;
	label: string;
}

export const WHISPER_MODELS: WhisperModel[] = [
	{ id: "base", file: "ggml-base.bin", size: "~150 MB", label: "Base — fastest, rough quality" },
	{ id: "small", file: "ggml-small.bin", size: "~490 MB", label: "Small — fast, good for English" },
	{ id: "large-v3-turbo-q5_0", file: "ggml-large-v3-turbo-q5_0.bin", size: "~570 MB", label: "Large v3 Turbo (q5) — best balance, multilingual (recommended)" },
	{ id: "large-v3-turbo", file: "ggml-large-v3-turbo.bin", size: "~1.6 GB", label: "Large v3 Turbo — highest quality" },
];

export const modelUrl = (m: WhisperModel) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${m.file}`;
export const getModel = (id: string) => WHISPER_MODELS.find((m) => m.id === id) ?? WHISPER_MODELS[2];

export interface Segment {
	start: number; // ms
	end: number; // ms
	text: string;
	speaker?: string;
}

export interface WhisperOptions {
	language: string;
	threads: number;
	onProgress?: (pct: number) => void;
	signal?: AbortSignal;
}

const NOISE_RE = /^[\s.]*([\[(（【♪*].*[\])）】♪*])?[\s.]*$/;

/** Runs whisper.cpp on a 16 kHz mono WAV and returns timestamped segments. */
export async function transcribeWav(bin: string, modelPath: string, wav: string, o: WhisperOptions): Promise<Segment[]> {
	const outBase = wav.replace(/\.wav$/, "");
	const threads = o.threads > 0 ? o.threads : Math.max(2, Math.min(8, os.cpus().length - 2));
	const args = ["-m", modelPath, "-f", wav, "-l", o.language || "auto", "-t", String(threads), "-oj", "-of", outBase, "-pp"];
	const tail: string[] = [];
	const code = await run(
		bin,
		args,
		(line) => {
			const m = line.match(/progress\s*=\s*(\d+)%/);
			if (m) o.onProgress?.(Number(m[1]));
			tail.push(line);
			if (tail.length > 12) tail.shift();
		},
		o.signal,
	);
	const jsonPath = outBase + ".json";
	if (code !== 0 || !fs.existsSync(jsonPath)) {
		throw new Error(`whisper.cpp failed (exit ${code}): ${tail.slice(-3).join(" | ")}`);
	}
	const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	const segments: Segment[] = [];
	let prev = "";
	for (const s of data.transcription ?? []) {
		const text = String(s.text ?? "").trim();
		if (!text || NOISE_RE.test(text) || text === prev) continue; // drop [BLANK_AUDIO], (music), repeats
		prev = text;
		segments.push({ start: s.offsets?.from ?? 0, end: s.offsets?.to ?? 0, text });
	}
	return segments;
}

export interface Paragraph {
	start: number;
	speaker?: string;
	text: string;
}

/** Merges segments (optionally from several speakers) into readable paragraphs. */
export function toParagraphs(segments: Segment[]): Paragraph[] {
	const sorted = [...segments].sort((a, b) => a.start - b.start);
	const out: Paragraph[] = [];
	let cur: (Paragraph & { end: number }) | null = null;
	for (const s of sorted) {
		const sameSpeaker = cur && cur.speaker === s.speaker;
		const closeInTime = cur && s.start - cur.end < 2500;
		if (cur && sameSpeaker && closeInTime && cur.text.length < 700) {
			cur.text += " " + s.text;
			cur.end = Math.max(cur.end, s.end);
		} else {
			if (cur) out.push(cur);
			cur = { start: s.start, end: s.end, speaker: s.speaker, text: s.text };
		}
	}
	if (cur) out.push(cur);
	return out.map(({ start, speaker, text }) => ({ start, speaker, text }));
}

export function formatClock(ms: number): string {
	const total = Math.floor(ms / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = String(m).padStart(2, "0");
	const ss = String(s).padStart(2, "0");
	return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function modelPathFor(modelsDir: string, id: string): string {
	return path.join(modelsDir, getModel(id).file);
}
