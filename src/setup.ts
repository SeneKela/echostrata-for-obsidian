import { App, Modal, Platform, setIcon } from "obsidian";
import * as fs from "fs";
import type NoteRecorderPlugin from "./main";
import { listAudioInputs, LOOPBACK_RE } from "./devices";
import { downloadFile, findBrew, findWhisper, formatBytes, openApp, pickFile, postNdjson, run, runInTerminal } from "./system";
import { getModel, modelPathFor, modelUrl } from "./transcriber";
import { listOllamaModels, matchInstalled, modelLabel } from "./summarizer";
import { buildHelper, canBuildHelper, helperBuilt, nativeSupported, openScreenRecordingSettings } from "./native-audio";

type Status = "ok" | "missing" | "optional" | "working";

interface Picker {
	label: string;
	placeholder?: string; // shown as first, unselectable-looking option when value is not in options
	options: Array<{ value: string; label: string }>;
	value: string;
	onChange: (v: string) => void;
}

interface Row {
	status: Status;
	title: string;
	desc: string;
	picker?: Picker;
	actions?: Array<{ label: string; cta?: boolean; run: () => void }>;
	progress?: number | null; // 0..1, null = indeterminate
	log?: string;
}

const SUGGESTED = [
	{ name: "qwen3:4b", size: "~2.6 GB" },
	{ name: "qwen3:8b", size: "~5.2 GB" },
];

/** Guided, terminal-free setup (mirrors the "Install what is missing" flow of Lecture Transcriber). */
export class SetupModal extends Modal {
	private rows: Record<string, Row> = {};
	private listEl!: HTMLElement;
	private busy = new Set<string>();

	constructor(app: App, private readonly plugin: NoteRecorderPlugin) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("nrt-setup");
		this.titleEl.setText("Note Recorder — setup");
		this.contentEl.createEl("p", { cls: "nrt-setup-intro", text: "Everything runs locally on your Mac. Nothing is uploaded." });
		this.listEl = this.contentEl.createDiv({ cls: "nrt-setup-list" });
		const footer = this.contentEl.createDiv({ cls: "nrt-setup-footer" });
		footer.createEl("button", { text: "Re-check" }).addEventListener("click", () => void this.check());
		footer.createEl("button", { text: "Done", cls: "mod-cta" }).addEventListener("click", () => this.close());
		void this.check();
	}

	private async check(): Promise<void> {
		const s = this.plugin.settings;
		if (!Platform.isMacOS) {
			this.rows.os = { status: "optional", title: "macOS", desc: "System-audio capture targets macOS. Microphone recording works everywhere." };
		}

		// 1. Microphone permission
		let micOk = false;
		try {
			const st = await navigator.mediaDevices.getUserMedia({ audio: true });
			st.getTracks().forEach((t) => t.stop());
			micOk = true;
		} catch {
			/* denied */
		}
		this.rows.mic = micOk
			? { status: "ok", title: "Microphone access", desc: "Granted." }
			: {
				status: "missing",
				title: "Microphone access",
				desc: "Allow Obsidian in System Settings → Privacy & Security → Microphone, then restart Obsidian.",
				actions: [{ label: "Open privacy settings", run: () => void run("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"]) }],
			};

		// 2a. Built-in system audio (ScreenCaptureKit helper)
		const dir = this.plugin.pluginDir;
		if (!this.busy.has("native")) {
			const want = s.systemDeviceId === "native";
			if (!nativeSupported()) {
				this.rows.native = { status: "optional", title: "Built-in system audio", desc: "Requires macOS 13 Ventura or later — use BlackHole below." };
			} else if (helperBuilt(dir)) {
				this.rows.native = {
					status: want ? "ok" : "optional",
					title: "Built-in system audio",
					desc: "Ready. On first recording, allow Obsidian under Screen & System Audio Recording, then restart Obsidian.",
					actions: [{ label: "Permission settings", run: () => openScreenRecordingSettings() }],
				};
			} else if (await canBuildHelper()) {
				this.rows.native = {
					status: want ? "missing" : "optional",
					title: "Built-in system audio",
					desc: "Compiles a tiny local helper (one time, ~30 s) that captures your Mac's audio via ScreenCaptureKit.",
					actions: [{ label: "Prepare", cta: true, run: () => void this.buildNative() }],
				};
			} else {
				this.rows.native = {
					status: want ? "missing" : "optional",
					title: "Built-in system audio",
					desc: "Needs Apple's Command Line Tools (free). Install, then press Re-check.",
					actions: [{ label: "Install tools", cta: true, run: () => void run("/usr/bin/xcode-select", ["--install"]) }],
				};
			}
		}

		// 2b. BlackHole (alternative)
		const inputs = await listAudioInputs().catch(() => [] as MediaDeviceInfo[]);
		const loop = inputs.find((d) => d.deviceId !== "default" && LOOPBACK_RE.test(d.label));
		this.rows.system = loop
			? {
				status: s.systemDeviceId === "native" ? "optional" : "ok",
				title: "Loopback device — alternative",
				desc: `Found “${loop.label}”. Route output through a Multi-Output Device to use it.`,
				actions: [{ label: "Audio MIDI Setup", run: () => openApp("Audio MIDI Setup") }],
			}
			: {
				status: s.systemDeviceId === "native" || s.systemDeviceId === "none" ? "optional" : "missing",
				title: "BlackHole — alternative",
				desc: "Only needed if built-in capture isn't available.",
				actions: [{ label: "Install BlackHole", run: () => runInTerminal("brew install --cask blackhole-2ch && echo '✅ Done — restart Obsidian'") }],
			};

		// 3. whisper.cpp
		const whisper = findWhisper(s.whisperPath);
		const brew = findBrew();
		const locate = { label: "Locate on this Mac…", run: () => void this.locateWhisper() };
		if (!this.busy.has("whisper")) {
			this.rows.whisper = whisper
				? { status: "ok", title: "Speech engine (whisper.cpp)", desc: whisper }
				: brew
					? {
						status: "missing",
						title: "Speech engine (whisper.cpp)",
						desc: "Installs Homebrew's whisper-cpp (uses Apple Silicon GPU via Metal), or pick an existing whisper-cli binary.",
						actions: [{ label: "Install", cta: true, run: () => void this.installWhisper(brew) }, locate],
					}
					: {
						status: "missing",
						title: "Speech engine (whisper.cpp)",
						desc: "Already have whisper-cli somewhere? Locate it. Otherwise install Homebrew from brew.sh, then press Re-check.",
						actions: [locate, { label: "Open brew.sh", run: () => window.open("https://brew.sh") }],
					};
		}

		// 4. Speech model
		const model = getModel(s.whisperModel);
		if (!this.busy.has("model")) {
			this.rows.model = fs.existsSync(modelPathFor(this.plugin.modelsDir, model.id))
				? { status: "ok", title: "Speech model", desc: model.label }
				: {
					status: "missing",
					title: "Speech model",
					desc: `${model.label} — ${model.size}. Change the model in settings.`,
					actions: [{ label: "Download", cta: true, run: () => void this.downloadModel() }],
				};
		}

		// 5. Ollama (optional) — pick any installed model, or download a suggested one
		if (!this.busy.has("ollama")) this.rows.ollama = await this.ollamaRow();

		this.draw();
	}

	private async ollamaRow(): Promise<Row> {
		const s = this.plugin.settings;
		const title = "Summaries (Ollama)";
		if (!s.summaryEnabled) return { status: "optional", title, desc: "Disabled in settings." };

		const models = await listOllamaModels(s.ollamaUrl);
		if (!models) {
			return {
				status: "optional",
				title: `${title} — optional`,
				desc: "Install and open Ollama to get a title, summary, key points and action items.",
				actions: [{ label: "Get Ollama", run: () => window.open("https://ollama.com/download") }],
			};
		}

		const names = models.map((m) => m.name);
		const current = matchInstalled(names, s.ollamaModel);
		const downloads = SUGGESTED.filter((m) => !matchInstalled(names, m.name)).map((m, i) => ({
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
				options: models.map((m) => ({ value: m.name, label: modelLabel(m) })),
				value: current ?? "",
				onChange: (v) => {
					void (async () => {
						s.ollamaModel = v;
						await this.plugin.saveSettings();
						this.rows.ollama = await this.ollamaRow();
						this.draw();
					})();
				},
			},
			actions: downloads,
		};
	}

	private async buildNative(): Promise<void> {
		this.busy.add("native");
		const row: Row = { status: "working", title: "Built-in system audio", desc: "Compiling helper…", progress: null, log: "" };
		this.rows.native = row;
		this.draw();
		try {
			await buildHelper(this.plugin.pluginDir, (l) => {
				row.log = l;
				this.draw();
			});
		} catch (e) {
			row.log = (e as Error).message;
		}
		this.busy.delete("native");
		await this.check();
	}

	private async locateWhisper(): Promise<void> {
		const p = await pickFile();
		if (!p) return;
		this.plugin.settings.whisperPath = p;
		await this.plugin.saveSettings();
		await this.check();
	}

	private async installWhisper(brew: string): Promise<void> {
		this.busy.add("whisper");
		const row: Row = { status: "working", title: "Speech engine (whisper.cpp)", desc: "Installing with Homebrew…", progress: null, log: "" };
		this.rows.whisper = row;
		this.draw();
		const code = await run(brew, ["install", "whisper-cpp"], (l) => {
			row.log = l;
			this.draw();
		}).catch(() => 1);
		this.busy.delete("whisper");
		if (code !== 0) row.desc = "Install failed — run `brew install whisper-cpp` in Terminal.";
		await this.check();
	}

	private async downloadModel(): Promise<void> {
		const model = getModel(this.plugin.settings.whisperModel);
		this.busy.add("model");
		const row: Row = { status: "working", title: "Speech model", desc: `Downloading ${model.label}…`, progress: 0 };
		this.rows.model = row;
		this.draw();
		try {
			await downloadFile(modelUrl(model), modelPathFor(this.plugin.modelsDir, model.id), (got, total) => {
				row.progress = total ? got / total : null;
				row.log = total ? `${formatBytes(got)} / ${formatBytes(total)}` : formatBytes(got);
				this.drawThrottled();
			});
		} catch (e) {
			row.log = `Failed: ${(e as Error).message}`;
		}
		this.busy.delete("model");
		await this.check();
	}

	private async pullOllama(name: string): Promise<void> {
		this.busy.add("ollama");
		const row: Row = { status: "working", title: "Summaries (Ollama)", desc: `Downloading ${name}…`, progress: null };
		this.rows.ollama = row;
		this.draw();
		try {
			await postNdjson<{ total?: number; completed?: number; status?: string }>(`${this.plugin.settings.ollamaUrl.replace(/\/$/, "")}/api/pull`, { model: name, stream: true }, (o) => {
				if (o.total && o.completed) row.progress = o.completed / o.total;
				row.log = o.status ?? "";
				this.drawThrottled();
			});
			this.plugin.settings.ollamaModel = name;
			await this.plugin.saveSettings();
		} catch (e) {
			row.log = `Failed: ${(e as Error).message}`;
		}
		this.busy.delete("ollama");
		await this.check();
	}

	private lastDraw = 0;
	private drawThrottled(): void {
		const now = Date.now();
		if (now - this.lastDraw > 150) {
			this.lastDraw = now;
			this.draw();
		}
	}

	private draw(): void {
		// The content area scrolls; keep its position and height stable while the list is rebuilt.
		const scroller = this.contentEl;
		const top = scroller.scrollTop;
		this.listEl.setCssStyles({ minHeight: `${this.listEl.offsetHeight}px` });
		this.listEl.empty();
		for (const row of Object.values(this.rows)) {
			const r = this.listEl.createDiv({ cls: `nrt-setup-row is-${row.status}` });
			const icon = r.createDiv({ cls: "nrt-setup-icon" });
			if (row.status === "working") icon.createSpan({ cls: "nrt-spinner" });
			else setIcon(icon, row.status === "ok" ? "check-circle-2" : row.status === "missing" ? "circle-dashed" : "minus-circle");
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
				const fill = track.createDiv({ cls: "nrt-fill" });
				if (row.progress != null) fill.setCssProps({ width: `${Math.round(row.progress * 100)}%` });
			}
			if (row.log) body.createDiv({ cls: "nrt-setup-log", text: row.log });
			if (row.actions?.length) {
				const a = r.createDiv({ cls: "nrt-setup-actions" });
				row.actions.forEach((act) =>
					a.createEl("button", { text: act.label, cls: act.cta ? "mod-cta" : "" }).addEventListener("click", act.run));
			}
		}
		this.listEl.setCssStyles({ minHeight: "" });
		scroller.scrollTop = top;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
