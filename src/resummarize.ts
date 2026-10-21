import { MarkdownView, Menu, Notice, TFile } from "obsidian";
import type NoteRecorderPlugin from "./main";
import { parseTranscript, replaceSummary } from "./note";
import { isoDate } from "./session";
import { summarize } from "./summarizer";
import { allTemplates, SummaryTemplate } from "./templates";
import { TemplateModal } from "./template-modal";

const NO_TRANSCRIPT = "No Echostrata transcript found here.";

/** Minimal view of an (undocumented) Obsidian canvas node. */
interface CanvasNode {
	file?: unknown;
	text?: unknown;
	setText?: (text: string) => void;
	canvas?: { requestSave?: () => void };
}

const isMarkdownFile = (f: unknown): f is TFile => f instanceof TFile && f.extension === "md";

/** Summarises the transcript found in `md` with `template`; returns the new summary blocks. */
async function buildSummary(plugin: NoteRecorderPlugin, md: string, title: string, date: string, template: SummaryTemplate): Promise<string[]> {
	const tr = parseTranscript(md);
	if (!tr) throw new Error(NO_TRANSCRIPT);
	const s = plugin.settings;
	const data = await summarize(
		s.ollamaUrl,
		s.ollamaModel,
		template,
		{ noteTitle: title, date, duration: tr.duration, speakers: tr.speakers || s.micSpeakerName },
		tr.text,
	);
	return template.render(data).blocks;
}

async function run(task: () => Promise<void>, template: SummaryTemplate): Promise<void> {
	const notice = new Notice(`Applying “${template.name}”…`, 0);
	try {
		await task();
		new Notice(`Summary updated with “${template.name}”.`);
	} catch (e) {
		console.error("[note-recorder]", e);
		new Notice(`Note Recorder: ${(e as Error).message}`, 8000);
	} finally {
		notice.hide();
	}
}

/** Re-summarises the transcript of a markdown note. */
export function applyTemplateToFile(plugin: NoteRecorderPlugin, file: TFile, template: SummaryTemplate): Promise<void> {
	return run(async () => {
		const md = await plugin.app.vault.read(file);
		const blocks = await buildSummary(plugin, md, file.basename, isoDate(new Date(file.stat.ctime)), template);
		await plugin.app.vault.process(file, (data) => replaceSummary(data, blocks));
		await plugin.app.fileManager.processFrontMatter(file, (fm) => {
			fm["echostrata-template"] = template.id;
		});
	}, template);
}

/** Re-summarises the transcript stored in a canvas text card. */
function applyTemplateToTextNode(plugin: NoteRecorderPlugin, node: CanvasNode, template: SummaryTemplate): Promise<void> {
	return run(async () => {
		const md = String(node.text ?? "");
		const blocks = await buildSummary(plugin, md, "Canvas card", isoDate(new Date()), template);
		const latest = typeof node.text === "string" ? node.text : md; // card may have been edited meanwhile
		node.setText!(replaceSummary(latest, blocks));
		node.canvas?.requestSave?.();
	}, template);
}

/** Last pointer position, tracked because a menu item's own click event no longer has a usable position once its menu closes. */
let pointer: { x: number; y: number } | null = null;

/** Opens the template picker, then applies the choice. With `atPointer`, a dropdown opens next to the cursor. */
export function pickTemplate(plugin: NoteRecorderPlugin, apply: (t: SummaryTemplate) => void, atPointer = false): void {
	if (atPointer && pointer) {
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Apply summary template").setIsLabel(true));
		for (const t of allTemplates()) menu.addItem((i) => i.setTitle(t.name).onClick(() => apply(t)));
		menu.showAtPosition(pointer);
		return;
	}
	new TemplateModal(plugin.app, apply, "Apply a summary template to this transcript…").open();
}

/** Wires up every entry point: command, editor menu, file menu and canvas card menu. */
export function registerResummarize(plugin: NoteRecorderPlugin): void {
	const { app } = plugin;
	const title = "Change summary template…";

	const track = (e: MouseEvent) => {
		pointer = { x: e.clientX, y: e.clientY };
	};
	plugin.registerDomEvent(document, "mousedown", track, true);
	plugin.registerDomEvent(document, "contextmenu", track, true);

	plugin.addCommand({
		id: "change-summary-template",
		name: "Change summary template of this transcript…",
		checkCallback: (checking) => {
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file || !parseTranscript(view.editor.getValue())) return false;
			const file = view.file;
			if (!checking) pickTemplate(plugin, (t) => void applyTemplateToFile(plugin, file, t));
			return true;
		},
	});

	plugin.registerEvent(
		app.workspace.on("editor-menu", (menu, editor, info) => {
			const file = info.file;
			if (!isMarkdownFile(file) || !parseTranscript(editor.getValue())) return;
			menu.addItem((i) =>
				i.setTitle(title).setIcon("sparkles").onClick(() => pickTemplate(plugin, (t) => void applyTemplateToFile(plugin, file, t), true)));
		}),
	);

	plugin.registerEvent(
		app.workspace.on("file-menu", (menu, file, source) => {
			if (source !== "more-options" || !isMarkdownFile(file)) return;
			menu.addItem((i) =>
				i.setTitle(title).setIcon("sparkles").onClick(() => pickTemplate(plugin, (t) => void applyTemplateToFile(plugin, file, t), true)));
		}),
	);

	// Canvas is not in the public typings; guard everything.
	plugin.registerEvent(
		(app.workspace as unknown as { on(n: string, cb: (menu: Menu, node: CanvasNode) => void): ReturnType<typeof app.workspace.on> })
			.on("canvas:node-menu", (menu, node) => {
				if (isMarkdownFile(node.file)) {
					const file = node.file;
					menu.addItem((i) =>
						i.setTitle(title).setIcon("sparkles").onClick(() => pickTemplate(plugin, (t) => void applyTemplateToFile(plugin, file, t), true)));
				} else if (typeof node.text === "string" && typeof node.setText === "function" && parseTranscript(node.text)) {
					menu.addItem((i) =>
						i.setTitle(title).setIcon("sparkles").onClick(() => pickTemplate(plugin, (t) => void applyTemplateToTextNode(plugin, node, t), true)));
				}
			}),
	);
}
