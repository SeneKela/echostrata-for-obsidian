import { MarkdownView, Menu, setIcon } from "obsidian";
import type NoteRecorderPlugin from "./main";
import { allTemplates } from "./templates";
import { formatClock } from "./transcriber";

const WAVE_BARS = 48;

/** Sets exactly one icon inside `el` (clears anything previously rendered there). */
function putIcon(el: HTMLElement, icon: string): void {
	el.empty();
	setIcon(el, icon);
	// Some Obsidian versions append instead of replacing — keep only the last SVG.
	const svgs = el.querySelectorAll("svg");
	for (let i = 0; i < svgs.length - 1; i++) svgs[i].remove();
}

/** Owns every piece of recording UI: header buttons, in-note bar, ribbon and status bar. */
export class NoteUI {
	private actions = new Map<MarkdownView, HeaderAction>();
	private bars = new Map<MarkdownView, RecordingBar>();
	private ticker: number | null = null;

	constructor(
		private readonly plugin: NoteRecorderPlugin,
		private readonly ribbonEl: HTMLElement,
		private readonly statusEl: HTMLElement,
	) {
		this.statusEl.addClass("nrt-status");
		this.statusEl.addEventListener("click", () => this.plugin.toggleRecording());
	}

	refresh(): void {
		const views = this.plugin.app.workspace
			.getLeavesOfType("markdown")
			.map((l) => l.view)
			.filter((v): v is MarkdownView => v instanceof MarkdownView);

		for (const [v, a] of this.actions) if (!views.includes(v)) { a.destroy(); this.actions.delete(v); }
		for (const [v, bar] of this.bars) if (!views.includes(v)) { bar.destroy(); this.bars.delete(v); }

		const session = this.plugin.session;
		for (const v of views) {
			let action = this.actions.get(v);
			if (!action || !action.el.isConnected) {
				action?.destroy();
				action = new HeaderAction(this.plugin, v);
				this.actions.set(v, action);
			}
			action.render();

			const path = v.file?.path;
			const job = path ? this.plugin.jobs.find((j) => j.file.path === path) : undefined;
			const wants = !!path && (session?.file.path === path || !!job);
			let bar = this.bars.get(v);
			if (bar && (!wants || bar.path !== path)) { bar.destroy(); this.bars.delete(v); bar = undefined; }
			if (wants && !bar) { bar = new RecordingBar(v.contentEl, this.plugin, path!); this.bars.set(v, bar); }
			bar?.render();
		}

		this.renderRibbon();
		this.renderStatus();
		this.ensureTicker();
	}

	/** Called ~15×/s by the recorder with peak levels (0..1). sys = -1 when not captured. */
	onLevel(mic: number, sys: number): void {
		const path = this.plugin.session?.file.path;
		for (const bar of this.bars.values()) if (bar.path === path) bar.pushLevel(mic, sys);
	}

	private get isRecording(): boolean {
		const p = this.plugin.session?.phase;
		return p === "recording" || p === "paused";
	}

	private ribbonIcon = "";
	private renderRibbon(): void {
		const icon = this.isRecording ? "square" : "mic";
		this.ribbonEl.toggleClass("nrt-recording", this.isRecording);
		if (icon !== this.ribbonIcon) {
			this.ribbonIcon = icon;
			putIcon(this.ribbonEl, icon);
		}
		this.ribbonEl.setAttr("aria-label", this.isRecording ? "Stop recording" : "Start recording in current note");
	}

	private renderStatus(): void {
		const session = this.plugin.session;
		const job = this.plugin.jobs.find((j) => j.phase === "transcribing" || j.phase === "summarizing" || j.phase === "saving");
		this.statusEl.empty();
		this.statusEl.toggleClass("nrt-status-rec", this.isRecording);
		if (session && this.isRecording) {
			this.statusEl.createSpan({ cls: "nrt-dot" });
			this.statusEl.createSpan({ text: `${session.phase === "paused" ? "PAUSED" : "REC"} ${formatClock(session.elapsedMs)}` });
			this.statusEl.setAttr("aria-label", "Click to stop recording");
		} else if (job) {
			this.statusEl.setText(`${job.message} ${job.phase === "transcribing" ? job.progress + "%" : ""}`.trim());
			this.statusEl.removeAttribute("aria-label");
		}
	}

	private ensureTicker(): void {
		const needs = !!this.plugin.session;
		if (needs && this.ticker === null) {
			this.ticker = window.setInterval(() => this.tick(), 250);
		} else if (!needs && this.ticker !== null) {
			window.clearInterval(this.ticker);
			this.ticker = null;
		}
	}

	private tick(): void {
		for (const a of this.actions.values()) a.tick();
		for (const bar of this.bars.values()) bar.tick();
		this.renderStatus();
	}

	destroy(): void {
		if (this.ticker !== null) window.clearInterval(this.ticker);
		this.actions.forEach((a) => a.destroy());
		this.bars.forEach((b) => b.destroy());
		this.actions.clear();
		this.bars.clear();
	}
}

/**
 * Header button. Uses a fixed DOM structure (one icon slot + one time slot) that is
 * updated in place, so the icon can never be rendered twice.
 */
class HeaderAction {
	readonly el: HTMLElement;
	private iconEl: HTMLElement;
	private timeEl: HTMLElement;
	private icon = "";

	constructor(private readonly plugin: NoteRecorderPlugin, view: MarkdownView) {
		// Remove leftovers (e.g. after a plugin reload) so only one button exists per view.
		view.containerEl.querySelectorAll(".nrt-action").forEach((n) => n.remove());
		this.el = view.addAction("mic", "Start recording", () => this.plugin.toggleRecording(view));
		this.el.addClass("nrt-action");
		this.el.empty(); // drop the icon Obsidian injected; we manage children ourselves
		this.iconEl = this.el.createSpan({ cls: "nrt-action-icon" });
		this.timeEl = this.el.createSpan({ cls: "nrt-action-time" });
	}

	render(): void {
		const session = this.plugin.session;
		const phase = session?.phase;
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

	tick(): void {
		const session = this.plugin.session;
		if (session) this.timeEl.setText(formatClock(session.elapsedMs));
	}

	destroy(): void {
		this.el.remove();
	}
}

/** Floating toolbar shown inside the note that is being recorded / transcribed. */
class RecordingBar {
	readonly el: HTMLElement;
	private key = "";
	private timeEl: HTMLElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private micFill: HTMLElement | null = null;
	private sysFill: HTMLElement | null = null;
	private progressFill: HTMLElement | null = null;
	private progressText: HTMLElement | null = null;
	private history = new Float32Array(WAVE_BARS);
	private drawPending = false;

	constructor(private readonly host: HTMLElement, private readonly plugin: NoteRecorderPlugin, readonly path: string) {
		host.addClass("nrt-host");
		this.el = host.createDiv({ cls: "nrt-bar" });
		this.el.setAttr("role", "status");
	}

	render(): void {
		const session = this.plugin.session?.file.path === this.path ? this.plugin.session : null;
		const job = this.plugin.jobs.find((j) => j.file.path === this.path);
		const key = session ? `rec:${session.phase}:${session.hasSystem}` : job ? `job:${job.phase}` : "none";
		if (key !== this.key) {
			this.key = key;
			this.build();
		}
		this.tick();
	}

	private build(): void {
		const el = this.el;
		el.empty();
		this.timeEl = this.canvas = this.micFill = this.sysFill = this.progressFill = this.progressText = null;
		const session = this.plugin.session?.file.path === this.path ? this.plugin.session : null;
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
			if (session.hasSystem) this.sysFill = this.meter(meters, "monitor-speaker", "System audio");
			else {
				const off = meters.createDiv({ cls: "nrt-meter nrt-meter-off", attr: { "aria-label": "System audio not captured" } });
				putIcon(off.createSpan({ cls: "nrt-meter-icon" }), "volume-x");
			}

			const btns = el.createDiv({ cls: "nrt-buttons" });
			this.button(btns, session.phase === "paused" ? "play" : "pause", session.phase === "paused" ? "Resume" : "Pause", "", () =>
				this.plugin.togglePause());
			this.button(btns, "square", "Stop & transcribe", "nrt-stop", () => this.plugin.stopRecording(), "Stop");
			this.button(btns, "chevron-down", "Summary template", "nrt-more", (e) => this.showTemplateMenu(e));
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
			if (job.phase !== "transcribing") track.addClass("nrt-indeterminate");
		}
	}

	tick(): void {
		const session = this.plugin.session?.file.path === this.path ? this.plugin.session : null;
		if (session && this.timeEl) this.timeEl.setText(formatClock(session.elapsedMs));
		const job = this.plugin.jobs.find((j) => j.file.path === this.path);
		if (job && this.progressText) {
			this.progressText.setText(job.phase === "transcribing" ? `${job.message} ${job.progress}%` : job.message);
			if (this.progressFill) this.progressFill.style.width = `${job.phase === "transcribing" ? job.progress : 100}%`;
		}
	}

	pushLevel(mic: number, sys: number): void {
		const level = Math.max(mic, sys);
		this.history.copyWithin(0, 1);
		this.history[WAVE_BARS - 1] = Math.min(1, level);
		const curve = (v: number) => `${Math.round(Math.min(1, Math.pow(Math.max(0, v), 0.5)) * 100)}%`;
		if (this.micFill) this.micFill.style.width = curve(mic);
		if (this.sysFill) this.sysFill.style.width = curve(sys);
		if (!this.drawPending) {
			this.drawPending = true;
			window.requestAnimationFrame(() => {
				this.drawPending = false;
				this.draw();
			});
		}
	}

	private draw(): void {
		const c = this.canvas;
		if (!c) return;
		const dpr = window.devicePixelRatio || 1;
		const w = c.clientWidth || 140;
		const h = c.clientHeight || 32;
		if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
		const g = c.getContext("2d");
		if (!g) return;
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, w, h);
		g.fillStyle = this.plugin.session?.phase === "paused" ? "rgba(255,255,255,0.28)" : "#f24822";
		const step = w / WAVE_BARS;
		const bw = Math.max(1.5, step * 0.55);
		for (let i = 0; i < WAVE_BARS; i++) {
			const v = Math.pow(this.history[i], 0.55);
			const bh = Math.max(2, v * (h - 2));
			g.globalAlpha = 0.35 + 0.65 * (i / WAVE_BARS);
			const x = i * step + (step - bw) / 2;
			const y = (h - bh) / 2;
			g.beginPath();
			if (typeof g.roundRect === "function") g.roundRect(x, y, bw, bh, bw / 2);
			else g.rect(x, y, bw, bh);
			g.fill();
		}
		g.globalAlpha = 1;
	}

	private meter(parent: HTMLElement, icon: string, label: string): HTMLElement {
		const m = parent.createDiv({ cls: "nrt-meter", attr: { "aria-label": label } });
		putIcon(m.createSpan({ cls: "nrt-meter-icon" }), icon);
		return m.createDiv({ cls: "nrt-track" }).createDiv({ cls: "nrt-fill" });
	}

	private button(parent: HTMLElement, icon: string, label: string, cls: string, onClick: (e: MouseEvent) => void, text?: string): void {
		const b = parent.createEl("button", { cls: `nrt-btn ${cls}`.trim(), attr: { "aria-label": label } });
		putIcon(b.createSpan({ cls: "nrt-btn-icon" }), icon);
		if (text) b.createSpan({ text });
		b.addEventListener("click", (e) => {
			e.preventDefault();
			onClick(e);
		});
	}

	/** Dropdown to pick the summary template for the running recording. */
	private showTemplateMenu(e: MouseEvent): void {
		const session = this.plugin.session;
		if (!session || session.file.path !== this.path) return;
		const current = session.activeTemplate.id;
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Summary template").setIsLabel(true));
		for (const t of allTemplates()) {
			menu.addItem((i) =>
				i.setTitle(t.name).setChecked(t.id === current).onClick(() => {
					session.templateId = t.id;
				}));
		}
		menu.showAtMouseEvent(e);
	}

	destroy(): void {
		this.el.remove();
		if (!this.host.querySelector(".nrt-bar")) this.host.removeClass("nrt-host");
	}
}
