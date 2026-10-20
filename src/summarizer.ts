import { requestUrl } from "obsidian";
import { formatBytes } from "./system";

export interface Summary {
	title: string;
	summary: string;
	keyPoints: string[];
	actionItems: string[];
}

export interface OllamaModel {
	name: string;
	size: number; // bytes
	parameterSize?: string; // e.g. "4.0B"
}

const MAX_CHARS = 60000;

const PROMPT = (transcript: string) => `You are given the transcript of a recording (a meeting, call or lecture).
Write in the SAME LANGUAGE as the transcript. Return ONLY a JSON object with these keys:
- "title": a short, specific title (max 8 words)
- "summary": 2-4 sentences describing what was discussed and concluded
- "keyPoints": 3-8 concise bullet strings with the most important points, facts or decisions
- "actionItems": bullet strings of concrete follow-ups with owner if mentioned (empty array if none)

Transcript:
"""
${transcript.length > MAX_CHARS ? transcript.slice(0, MAX_CHARS) + "\n[…truncated]" : transcript}
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

export async function summarize(baseUrl: string, model: string, transcript: string): Promise<Summary> {
	const res = await requestUrl({
		url: `${baseUrl.replace(/\/$/, "")}/api/generate`,
		method: "POST",
		contentType: "application/json",
		body: JSON.stringify({
			model,
			prompt: PROMPT(transcript),
			stream: false,
			format: "json",
			think: false,
			options: { temperature: 0.2, num_ctx: 32768 },
		}),
		throw: false,
	});
	if (res.status !== 200) throw new Error(`Ollama returned HTTP ${res.status}`);
	const raw = String(res.json.response ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
	const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
	const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
	return {
		title: String(parsed.title ?? "").trim(),
		summary: String(parsed.summary ?? "").trim(),
		keyPoints: list(parsed.keyPoints ?? parsed.key_points),
		actionItems: list(parsed.actionItems ?? parsed.action_items),
	};
}
