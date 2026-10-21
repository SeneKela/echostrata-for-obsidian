import { requestUrl } from "obsidian";
import { formatBytes } from "./system";
import { BASE_PROMPT, SummaryTemplate } from "./templates";

/** Context for the user message (`{{note_title}}`, `{{date}}`, `{{duration}}`, `{{speakers}}`). */
export interface SummaryContext {
	noteTitle: string;
	date: string;
	duration: string;
	speakers: string;
}

export interface OllamaModel {
	name: string;
	size: number; // bytes
	parameterSize?: string; // e.g. "4.0B"
}

const MAX_CHARS = 60000;
const RETRY_NOTE = "Your previous answer was not valid JSON. Return only the JSON object.";

const userMessage = (ctx: SummaryContext, transcript: string) => `Note: ${ctx.noteTitle}
Date: ${ctx.date} · Duration: ${ctx.duration} · Speakers: ${ctx.speakers}

Transcript:
"""
${transcript.length > MAX_CHARS ? transcript.slice(0, MAX_CHARS) + "\n[…transcript truncated: it was too long to include in full]" : transcript}
"""`;

/** Returns every model installed in Ollama, or null when Ollama is not reachable. */
export async function listOllamaModels(baseUrl: string): Promise<OllamaModel[] | null> {
	try {
		const res = await requestUrl({ url: `${baseUrl.replace(/\/$/, "")}/api/tags`, throw: false });
		if (res.status !== 200) return null;
		return (res.json.models ?? [])
			.map((m: any) => ({
				name: String(m.name ?? m.model),
				size: Number(m.size ?? 0),
				parameterSize: m.details?.parameter_size ? String(m.details.parameter_size) : undefined,
			}))
			.filter((m: OllamaModel) => !!m.name)
			.sort((a: OllamaModel, b: OllamaModel) => a.name.localeCompare(b.name));
	} catch {
		return null;
	}
}

/** "qwen3:8b  (8.2B · 5.20 GB)" */
export function modelLabel(m: OllamaModel): string {
	const meta = [m.parameterSize, m.size ? formatBytes(m.size) : ""].filter(Boolean).join(" · ");
	return meta ? `${m.name}  (${meta})` : m.name;
}

/** Matches "llama3" to "llama3:latest" etc. Returns the installed name or null. */
export function matchInstalled(names: string[], wanted: string): string | null {
	if (names.includes(wanted)) return wanted;
	if (!wanted.includes(":") && names.includes(`${wanted}:latest`)) return `${wanted}:latest`;
	if (wanted.endsWith(":latest") && names.includes(wanted.slice(0, -7))) return wanted.slice(0, -7);
	return null;
}

async function chat(baseUrl: string, model: string, system: string, user: string): Promise<Record<string, unknown>> {
	const res = await requestUrl({
		url: `${baseUrl.replace(/\/$/, "")}/api/chat`,
		method: "POST",
		contentType: "application/json",
		body: JSON.stringify({
			model,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
			stream: false,
			format: "json",
			think: false,
			options: { temperature: 0.2, num_ctx: 32768 },
		}),
		throw: false,
	});
	if (res.status !== 200) throw new Error(`Ollama returned HTTP ${res.status}`);
	const raw = String(res.json.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
	const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Model did not return a JSON object");
	return parsed;
}

/**
 * Summarises a transcript with the given template and returns the model's JSON object.
 * Retries once if the model returns invalid JSON; throws if it fails again (HTTP errors are not retried).
 */
export async function summarize(
	baseUrl: string,
	model: string,
	template: SummaryTemplate,
	ctx: SummaryContext,
	transcript: string,
): Promise<Record<string, unknown>> {
	const system = `${BASE_PROMPT}\n\n${template.prompt}`;
	const user = userMessage(ctx, transcript);
	try {
		return await chat(baseUrl, model, system, user);
	} catch (e) {
		if (!(e instanceof SyntaxError) && !String((e as Error).message).startsWith("Model did not")) throw e;
		return chat(baseUrl, model, `${system}\n\n${RETRY_NOTE}`, user);
	}
}
