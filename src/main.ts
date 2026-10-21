import { FileSystemAdapter, MarkdownView, Notice, Plugin } from "obsidian";
import type { ChildProcess } from "child_process";
import * as path from "path";
import { DEFAULT_SETTINGS, RecorderSettings, RecorderSettingTab } from "./settings";
import { ProcessingJob, RecordingSession } from "./session";
import { NoteUI } from "./ui";
import { SetupModal } from "./setup";
import { TemplateModal } from "./template-modal";
import { setCustomTemplates } from "./templates";
import { registerResummarize } from "./resummarize";
import { startCaffeinate } from "./system";

export default class NoteRecorderPlugin extends Plugin {
	settings!: RecorderSettings;
	session: RecordingSession | null = null;
	jobs: ProcessingJob[] = [];
	ui!: NoteUI;
	private caffeinate: ChildProcess | null = null;

	/** Absolute path of this plugin's folder. */
	get pluginDir(): string {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) throw new Error("Desktop vault required");
		return path.join(adapter.getBasePath(), this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`);
	}

	get modelsDir(): string {
		return path.join(this.pluginDir, "models");
	}

	async onload(): Promise<void> {
		await this.loadSettings();

		const ribbon = this.addRibbonIcon("mic", "Start recording in current note", () => this.toggleRecording());
		ribbon.addClass("nrt-ribbon");
		this.ui = new NoteUI(this, ribbon, this.addStatusBarItem());
		this.addSettingTab(new RecorderSettingTab(this.app, this));

		this.addCommand({ id: "toggle-recording", name: "Start / stop recording in current note", callback: () => this.toggleRecording() });
		this.addCommand({
			id: "record-with-template",
			name: "Record with template…",
			checkCallback: (checking) => {
				if (this.session || !this.app.workspace.getActiveViewOfType(MarkdownView)?.file) return false;
				if (!checking) new TemplateModal(this.app, (t) => void this.startRecording(undefined, t.id)).open();
				return true;
			},
		});
		this.addCommand({
			id: "pause-recording",
			name: "Pause / resume recording",
			checkCallback: (checking) => {
				if (!this.session || this.session.phase === "starting" || this.session.phase === "stopping") return false;
				if (!checking) this.togglePause();
				return true;
			},
		});
		this.addCommand({
			id: "discard-recording",
			name: "Discard current recording",
			checkCallback: (checking) => {
				if (!this.session) return false;
				if (!checking) void this.cancelRecording();
				return true;
			},
		});
		this.addCommand({ id: "open-setup", name: "Open setup assistant", callback: () => this.openSetup() });
		registerResummarize(this);

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

	onunload(): void {
		if (this.session) void this.session.cancel();
		this.session = null;
		this.ui?.destroy();
		this.setKeepAwake(false);
	}

	/* ---------------- recording control ---------------- */

	toggleRecording(view?: MarkdownView): void {
		if (this.session) {
			if (this.session.phase === "recording" || this.session.phase === "paused") void this.stopRecording();
			return;
		}
		void this.startRecording(view);
	}

	async startRecording(view?: MarkdownView, templateId?: string): Promise<void> {
		const target = view ?? this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!target?.file) {
			new Notice("Open a note first — the recording is added to it.");
			return;
		}
		const session = new RecordingSession(this, target.file, target, templateId);
		this.session = session;
		this.ui.refresh();
		try {
			await session.start();
			this.setKeepAwake(true);
		} catch (e) {
			this.session = null;
			const err = e as DOMException;
			const msg = err?.name === "NotAllowedError"
				? "Microphone access denied. Allow Obsidian in System Settings → Privacy & Security → Microphone."
				: `Could not start recording: ${err?.message ?? e}`;
			new Notice(msg, 8000);
		}
		this.ui.refresh();
	}

	togglePause(): void {
		const s = this.session;
		if (!s) return;
		if (s.phase === "recording") s.pause();
		else if (s.phase === "paused") s.resume();
		this.ui.refresh();
	}

	async stopRecording(): Promise<void> {
		const s = this.session;
		if (!s || (s.phase !== "recording" && s.phase !== "paused")) return;
		try {
			const pending = s.stop(); // flips phase to "stopping" synchronously
			this.ui.refresh();
			const job = await pending;
			this.session = null;
			this.jobs.push(job);
			this.ui.refresh();
			void job.run();
		} catch (e) {
			this.session = null;
			new Notice(`Recording failed: ${(e as Error).message}`, 8000);
			this.ui.refresh();
			this.updateKeepAwake();
		}
	}

	async cancelRecording(): Promise<void> {
		const s = this.session;
		if (!s) return;
		await s.cancel();
		this.session = null;
		new Notice("Recording discarded.");
		this.ui.refresh();
		this.updateKeepAwake();
	}

	onJobFinished(job: ProcessingJob): void {
		this.ui.refresh();
		this.updateKeepAwake();
		window.setTimeout(() => {
			this.jobs = this.jobs.filter((j) => j !== job);
			this.ui.refresh();
		}, job.phase === "error" ? 8000 : 3500);
	}

	openSetup(): void {
		new SetupModal(this.app, this).open();
	}

	/* ---------------- keep awake ---------------- */

	private updateKeepAwake(): void {
		const busy = !!this.session || this.jobs.some((j) => j.phase !== "done" && j.phase !== "error");
		this.setKeepAwake(busy);
	}

	private setKeepAwake(on: boolean): void {
		if (on && this.settings.keepAwake && !this.caffeinate) this.caffeinate = startCaffeinate();
		if (!on && this.caffeinate) {
			this.caffeinate.kill();
			this.caffeinate = null;
		}
	}

	/* ---------------- settings ---------------- */

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) ?? {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		setCustomTemplates(this.settings.customTemplates);
		// v2: built-in macOS capture replaces BlackHole auto-detect as the default system source.
		if ((data.settingsVersion ?? 1) < 2) {
			if (this.settings.systemDeviceId === "auto") this.settings.systemDeviceId = "native";
			this.settings.settingsVersion = 2;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
