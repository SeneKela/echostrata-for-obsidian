import { MarkdownView, normalizePath, Notice, TFile } from "obsidian";
import * as fs from "fs";
import type NoteRecorderPlugin from "./main";
import { AudioRecorder, RecorderResult, SystemSource } from "./recorder";
import { defaultInputIsLoopback, resolveSystemDevice } from "./devices";
import { buildHelper, canBuildHelper, helperBuilt, helperPath, NativeAudioError, nativeSupported, openScreenRecordingSettings } from "./native-audio";
import { callout, insertBlock, removeBlock, updateBlock, wrapSummary } from "./note";
import { findWhisper, makeWorkDir, removeDir } from "./system";
import { formatClock, modelPathFor, Paragraph, Segment, toParagraphs, transcribeWav } from "./transcriber";
import { summarize } from "./summarizer";
import { getTemplate, RenderedSummary, SummaryTemplate } from "./templates";

export type RecPhase = "starting" | "recording" | "paused" | "stopping";
export type JobPhase = "saving" | "transcribing" | "summarizing" | "done" | "error";

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function isoDate(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function stamp(d = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

/* ------------------------------------------------------------------ */
/* Recording                                                          */
/* ------------------------------------------------------------------ */

export class RecordingSession {
	readonly id = newId();
	readonly startedAt = new Date();
	phase: RecPhase = "starting";
	private recorder: AudioRecorder | null = null;
	private workDir: string;

	constructor(
		private readonly plugin: NoteRecorderPlugin,
		readonly file: TFile,
		private readonly view: MarkdownView | null,
		/** Summary template chosen for this recording; can be changed while recording. */
		public templateId?: string,
	) {
		this.workDir = makeWorkDir(this.id);
	}

	/** Template that will be used: explicit choice, else the note's `echostrata-template`, else the setting. */
	get activeTemplate(): SummaryTemplate {
		const fm = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter;
		const tmplId = typeof fm?.["echostrata-template"] === "string" ? (fm["echostrata-template"] as string) : undefined;
		return getTemplate(this.templateId ?? tmplId ?? this.plugin.settings.summaryTemplate);
	}

	get elapsedMs(): number {
		return this.recorder?.elapsedMs ?? 0;
	}

	get hasSystem(): boolean {
		return !!this.recorder?.hasSystem;
	}

	async start(): Promise<void> {
		const { app, settings: s } = this.plugin;
		await insertBlock(app, this.file, this.view, this.id, callout("danger", "🔴 Recording in progress…"), s.insertPosition);
		try {
			const system = await this.resolveSystem();
			if (s.micDeviceId === "default" && (await defaultInputIsLoopback())) {
				new Notice("Your macOS default input is a loopback device. Pick your real microphone in Note Recorder settings.", 8000);
			}
			this.recorder = new AudioRecorder({
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
				new Notice(`System audio not captured — recording microphone only.\n${err.message}`, 12000);
				if (err instanceof NativeAudioError && err.isPermission) openScreenRecordingSettings();
			} else if (!system && s.systemDeviceId !== "none") {
				new Notice("No system-audio source available — recording microphone only. Open the setup assistant.", 8000);
			}
			this.phase = "recording";
		} catch (e) {
			await this.recorder?.cancel();
			await removeBlock(app, this.file, this.id);
			removeDir(this.workDir);
			throw e;
		}
	}

	/** Turns the "System audio" setting into a concrete source, building the native helper if needed. */
	private async resolveSystem(): Promise<SystemSource> {
		const s = this.plugin.settings;
		if (s.systemDeviceId === "none") return null;
		if (s.systemDeviceId === "native") {
			if (nativeSupported()) {
				const dir = this.plugin.pluginDir;
				if (helperBuilt(dir)) return { kind: "native", bin: helperPath(dir) };
				if (await canBuildHelper()) {
					const n = new Notice("Preparing built-in system-audio capture (one time, ~30 s)…", 0);
					try {
						return { kind: "native", bin: await buildHelper(dir) };
					} catch (e) {
						new Notice((e as Error).message, 10000);
					} finally {
						n.hide();
					}
				} else {
					new Notice("Built-in system audio needs Xcode Command Line Tools — open the setup assistant.", 8000);
				}
			}
			const dev = await resolveSystemDevice("auto"); // fallback: BlackHole if installed
			return dev ? { kind: "device", deviceId: dev.deviceId } : null;
		}
		const dev = await resolveSystemDevice(s.systemDeviceId);
		return dev ? { kind: "device", deviceId: dev.deviceId } : null;
	}

	pause(): void {
		if (this.phase !== "recording") return;
		this.recorder?.pause();
		this.phase = "paused";
	}

	resume(): void {
		if (this.phase !== "paused") return;
		this.recorder?.resume();
		this.phase = "recording";
	}

	async stop(): Promise<ProcessingJob> {
		this.phase = "stopping";
		const result = await this.recorder!.stop();
		return new ProcessingJob(this.plugin, this.file, this.id, this.startedAt, this.workDir, result, this.templateId);
	}

	async cancel(): Promise<void> {
		this.phase = "stopping";
		await this.recorder?.cancel();
		await removeBlock(this.plugin.app, this.file, this.id).catch(() => undefined);
		removeDir(this.workDir);
	}
}

/* ------------------------------------------------------------------ */
/* Post-processing: save audio → transcribe → summarise → write note  */
/* ------------------------------------------------------------------ */

export class ProcessingJob {
	phase: JobPhase = "saving";
	progress = 0; // 0..100
	message = "Saving audio…";
	private embed = "";

	constructor(
		private readonly plugin: NoteRecorderPlugin,
		readonly file: TFile,
		private readonly id: string,
		private readonly startedAt: Date,
		private readonly workDir: string,
		private readonly rec: RecorderResult,
		private readonly templateId?: string,
	) {}

	/** Template chosen for this recording, else the note's `echostrata-template` frontmatter, else the setting. */
	private resolveTemplate(): SummaryTemplate {
		const fm = this.plugin.app.metadataCache.getFileCache(this.file)?.frontmatter;
		const tmplId = typeof fm?.["echostrata-template"] === "string" ? (fm["echostrata-template"] as string) : undefined;
		return getTemplate(this.templateId ?? tmplId ?? this.plugin.settings.summaryTemplate);
	}

	private set(phase: JobPhase, message: string, progress = this.progress): void {
		this.phase = phase;
		this.message = message;
		this.progress = progress;
		this.plugin.ui.refresh();
	}

	async run(): Promise<void> {
		const { app, settings: s } = this.plugin;
		try {
			const audio = await this.saveAudio();
			this.embed = "!" + app.fileManager.generateMarkdownLink(audio, this.file.path);
			await updateBlock(app, this.file, this.id, `${this.embed}\n\n${callout("info", "⏳ Transcribing…")}`);

			const bin = findWhisper(s.whisperPath);
			const model = modelPathFor(this.plugin.modelsDir, s.whisperModel);
			if (!bin || !fs.existsSync(model)) {
				throw new Error("Transcription is not set up yet — open Settings → Note Recorder → Open setup.");
			}

			this.set("transcribing", "Transcribing…", 0);
			const paragraphs = await this.transcribe(bin, model);
			let summary: RenderedSummary | null = null;
			if (s.summaryEnabled && paragraphs.length) {
				this.set("summarizing", "Writing summary…", 100);
				try {
					const template = this.resolveTemplate();
					const data = await summarize(
						s.ollamaUrl,
						s.ollamaModel,
						template,
						{
							noteTitle: this.file.basename,
							date: isoDate(this.startedAt),
							duration: formatClock(this.rec.durationMs),
							speakers: [...new Set(paragraphs.map((p) => p.speaker).filter(Boolean))].join(", ") || s.micSpeakerName,
						},
						plain(paragraphs),
					);
					summary = template.render(data);
				} catch (e) {
					console.warn("[note-recorder] summary skipped", e);
				}
			}
			await updateBlock(app, this.file, this.id, this.render(paragraphs, summary), true);
			this.set("done", paragraphs.length ? "Transcript added" : "No speech detected", 100);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error("[note-recorder]", e);
			this.set("error", msg);
			const body = [this.embed, callout("warning", "Transcription failed", [msg])].filter(Boolean).join("\n\n");
			await updateBlock(app, this.file, this.id, body, true).catch(() => undefined);
			new Notice(`Note Recorder: ${msg}`, 8000);
		} finally {
			removeDir(this.workDir);
			this.plugin.onJobFinished(this);
		}
	}

	private async saveAudio(): Promise<TFile> {
		const { app, settings: s } = this.plugin;
		const name = `Recording ${stamp(this.startedAt)}.${this.rec.extension}`;
		let target: string;
		if (s.recordingsFolder) {
			const folder = normalizePath(s.recordingsFolder);
			if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
			target = normalizePath(`${folder}/${name}`);
		} else {
			target = await app.fileManager.getAvailablePathForAttachment(name, this.file.path);
		}
		return app.vault.createBinary(target, await this.rec.blob.arrayBuffer());
	}

	private async transcribe(bin: string, model: string): Promise<Paragraph[]> {
		const s = this.plugin.settings;
		const r = this.rec;
		type Task = { wav: string; speaker?: string };
		let tasks: Task[];
		if (s.labelSpeakers && r.sysWav && r.micHasAudio && r.sysHasAudio) {
			tasks = [
				{ wav: r.micWav, speaker: s.micSpeakerName },
				{ wav: r.sysWav, speaker: s.systemSpeakerName },
			];
		} else if (r.micHasAudio || r.sysHasAudio) {
			tasks = [{ wav: r.mixWav }];
		} else {
			return [];
		}

		const all: Segment[] = [];
		for (let i = 0; i < tasks.length; i++) {
			const t = tasks[i];
			const label = tasks.length > 1 ? `Transcribing ${t.speaker}…` : "Transcribing…";
			this.set("transcribing", label, Math.round((i / tasks.length) * 100));
			const segs = await transcribeWav(bin, model, t.wav, {
				language: s.language,
				threads: s.threads,
				onProgress: (p) => {
					const overall = Math.round(((i + p / 100) / tasks.length) * 100);
					if (overall !== this.progress) this.set("transcribing", label, overall);
				},
			});
			segs.forEach((seg) => all.push({ ...seg, speaker: t.speaker }));
		}
		return toParagraphs(all);
	}

	private render(paragraphs: Paragraph[], summary: RenderedSummary | null): string {
		const s = this.plugin.settings;
		const parts: string[] = [this.embed];
		if (summary) parts.push(wrapSummary(summary.blocks));
		const speakers = [...new Set(paragraphs.map((p) => p.speaker).filter(Boolean))];
		const title = `Transcript · ${formatClock(this.rec.durationMs)}${speakers.length ? " · " + speakers.join(" / ") : ""}`;
		const body = paragraphs.length
			? paragraphs.flatMap((p, i) => {
				const ts = s.showTimestamps ? `\`${formatClock(p.start)}\` ` : "";
				const who = p.speaker ? `**${p.speaker}:** ` : "";
				return i ? ["", `${ts}${who}${p.text}`] : [`${ts}${who}${p.text}`];
			})
			: ["*No speech detected.*"];
		parts.push(callout("quote", title, body, s.transcriptFolded));
		return parts.join("\n\n");
	}
}

function plain(paragraphs: Paragraph[]): string {
	return paragraphs.map((p) => (p.speaker ? `${p.speaker}: ${p.text}` : p.text)).join("\n");
}
