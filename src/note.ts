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
