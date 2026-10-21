import { App, MarkdownView, TFile } from "obsidian";

/**
 * A recording occupies a block in the note delimited by invisible Obsidian comments:
 *   %%nrt:ID%% … %%/nrt:ID%%
 * The block is updated in place (recording → transcribing → final) and the markers
 * are removed once the final content is written.
 */
const open = (id: string) => `%%nrt:${id}%%`;
const close = (id: string) => `%%/nrt:${id}%%`;
const wrap = (id: string, body: string) => `${open(id)}\n${body}\n\n${close(id)}`;

export function callout(type: string, title: string, lines: string[] = [], folded = false): string {
	const head = `> [!${type}]${folded ? "-" : ""} ${title}`;
	return [head, ...lines.map((l) => (l ? `> ${l}` : ">"))].join("\n");
}

export async function insertBlock(
	app: App,
	file: TFile,
	view: MarkdownView | null,
	id: string,
	body: string,
	position: "cursor" | "end",
): Promise<void> {
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
export async function updateBlock(app: App, file: TFile, id: string, body: string, final = false): Promise<void> {
	await app.vault.process(file, (data) => {
		const s = data.indexOf(open(id));
		const eIdx = data.indexOf(close(id));
		const replacement = final ? body : wrap(id, body);
		if (s < 0 || eIdx < s) return data.replace(/\s*$/, "") + "\n\n" + replacement + "\n";
		return data.slice(0, s) + replacement + data.slice(eIdx + close(id).length);
	});
}

export async function removeBlock(app: App, file: TFile, id: string): Promise<void> {
	await app.vault.process(file, (data) => {
		const s = data.indexOf(open(id));
		const eIdx = data.indexOf(close(id));
		if (s < 0 || eIdx < s) return data;
		const before = data.slice(0, s).replace(/\n+$/, "");
		const after = data.slice(eIdx + close(id).length).replace(/^\n+/, "");
		return before && after ? `${before}\n\n${after}` : (before || after).replace(/\n*$/, "\n");
	});
}

/* ------------------------------------------------------------------ */
/* Finished notes: transcript parsing and summary replacement          */
/* ------------------------------------------------------------------ */

const SUMMARY_OPEN = "%%nrt-summary%%";
const SUMMARY_CLOSE = "%%/nrt-summary%%";
const TRANSCRIPT_HEAD = /^> \[!quote\][-+]? Transcript\b(.*)$/;

/** Wraps the summary callouts in invisible markers so they can be replaced later. */
export function wrapSummary(blocks: string[]): string {
	return `${SUMMARY_OPEN}\n${blocks.join("\n\n")}\n\n${SUMMARY_CLOSE}`;
}

export interface ParsedTranscript {
	/** `Speaker: text` lines (no timestamps), ready for the summariser. */
	text: string;
	duration: string;
	speakers: string;
	/** Line range of the transcript callout (end exclusive). */
	start: number;
	end: number;
}

/** Finds the first `> [!quote] Transcript …` callout that has spoken text. */
export function parseTranscript(md: string): ParsedTranscript | null {
	const lines = md.split("\n");
	const start = lines.findIndex((l) => TRANSCRIPT_HEAD.test(l));
	if (start < 0) return null;
	let end = start + 1;
	while (end < lines.length && lines[end].startsWith(">")) end++;
	const [, duration = "", speakers = ""] = (TRANSCRIPT_HEAD.exec(lines[start])![1] ?? "").split("·").map((s) => s.trim());
	const text = lines
		.slice(start + 1, end)
		.map((l) => l.replace(/^>\s?/, "").trim())
		.filter(Boolean)
		.map((l) => l.replace(/^`[^`]*`\s*/, "").replace(/^\*\*(.+?):\*\*\s*/, "$1: "))
		.join("\n");
	if (!text || text === "*No speech detected.*") return null;
	return { text, duration, speakers: speakers.replace(/\s*\/\s*/g, ", "), start, end };
}

/**
 * Replaces the summary of the transcript in `md` with `blocks`.
 * Uses the summary markers when present; for older notes it replaces the callouts directly above the transcript.
 */
export function replaceSummary(md: string, blocks: string[]): string {
	const wrapped = wrapSummary(blocks);
	const s = md.indexOf(SUMMARY_OPEN);
	const e = md.indexOf(SUMMARY_CLOSE);
	if (s >= 0 && e > s) return md.slice(0, s) + wrapped + md.slice(e + SUMMARY_CLOSE.length);

	const tr = parseTranscript(md);
	if (!tr) return md;
	const lines = md.split("\n");
	let from = tr.start;
	while (from > 0 && (lines[from - 1].trim() === "" || lines[from - 1].startsWith(">"))) from--;
	return [...lines.slice(0, from), ...(from > 0 ? [""] : []), wrapped, "", ...lines.slice(tr.start)].join("\n");
}

