import { callout } from "./note";

type Json = Record<string, unknown>;

export interface RenderedSummary {
	title: string;
	/** Markdown blocks to write into the note (main callout first, optional extra callouts after). */
	blocks: string[];
}

export interface SummaryTemplate {
	id: string;
	name: string;
	useFor: string;
	writes: string;
	hint?: string;
	/** Template-specific part of the system prompt (goal, fields and JSON schema). */
	prompt: string;
	render(data: Json): RenderedSummary;
}

export const BASE_PROMPT = `You turn a recorded conversation transcript into structured notes for an Obsidian vault.

Speakers:
- "Me" is the person who recorded (their microphone).
- "Others" is everyone heard through the computer (call participants, a lecturer, a video).
- "Others" can be several people. Use real names only if they are said in the transcript.

Rules:
1. Write in the SAME LANGUAGE as the transcript.
2. Use only what is in the transcript. Never invent names, numbers, dates, owners or decisions.
3. If something is unclear, leave it out or list it as an open question.
4. Be concise: short sentences, no filler, no "the speaker said that…".
5. Keep numbers, dates, product names and proper nouns exactly as spoken.
6. Transcripts have recognition errors. Fix obvious ones silently; never guess at unclear ones.
7. Return ONLY one valid JSON object that matches the schema below. No Markdown, no comments, no text before or after.
8. If a list has nothing to put in it, return an empty array [].`;

/* ------------------------------------------------------------------ */
/* Rendering helpers (small models are sloppy — be lenient)            */
/* ------------------------------------------------------------------ */

/** Single-line, trimmed text. */
const line = (v: unknown): string => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
/** Like `line`, but treats "null"-ish strings as empty (for optional owner / due / role fields). */
const opt = (v: unknown): string => {
	const t = line(v);
	return /^(null|none|n\/a|unknown|undefined)$/i.test(t) ? "" : t;
};
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(line).filter(Boolean) : []);
/** Array of objects; bare strings become `{ [key]: string }`. */
const rows = (v: unknown, key: string): Json[] =>
	Array.isArray(v)
		? v.flatMap((x): Json[] =>
			typeof x === "string" ? (x.trim() ? [{ [key]: x }] : []) : x && typeof x === "object" && !Array.isArray(x) ? [x as Json] : [])
		: [];

const bullets = (items: string[]): string[] => items.map((i) => `- ${i}`);
const numbered = (items: string[]): string[] => items.map((i, n) => `${n + 1}. ${i}`);
const section = (heading: string, items: string[]): string[] => (items.length ? ["", `**${heading}**`, ...items] : []);
const lead = (lines: string[]): string[] => {
	const out = [...lines];
	while (out.length && !out[0]) out.shift();
	return out;
};

const owner = (who: unknown, due: unknown): string => {
	const o = opt(who);
	const d = opt(due);
	return (o ? ` — ${o}` : "") + (d ? ` · 📅 ${d}` : "");
};
const tasks = (items: Json[]): string[] =>
	items.filter((r) => line(r.task)).map((r) => `- [ ] ${line(r.task)}${owner(r.owner, r.due)}`);

function result(d: Json, intro: string, sections: string[][], extra: string[] = []): RenderedSummary {
	const title = line(d.title);
	return { title, blocks: [callout("abstract", title || "Summary", lead([intro, ...sections.flat()])), ...extra] };
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

const meeting: SummaryTemplate = {
	id: "meeting",
	name: "Meeting",
	useFor: "Team meetings, syncs, workshops",
	writes: "summary, decisions, key points, action items, open questions",
	prompt: `Template: MEETING.

Goal: someone who missed the meeting understands in 30 seconds what was decided and who does what next.

Write:
- title: specific, at most 8 words (e.g. "Q4 roadmap: search before sharing"), not "Meeting notes".
- summary: 2–4 sentences: purpose, main outcome, what is still open.
- decisions: things that were clearly agreed. Not suggestions.
- keyPoints: 3–7 important facts, figures or arguments that are not decisions.
- actionItems: concrete next steps, each starting with a verb. owner = the person named, "Me", or null. due = the date or deadline as spoken, or null.
- openQuestions: questions raised but not answered.

Schema:
{
  "title": string,
  "summary": string,
  "decisions": string[],
  "keyPoints": string[],
  "actionItems": [{ "task": string, "owner": string | null, "due": string | null }],
  "openQuestions": string[]
}`,
	render: (d) =>
		result(d, line(d.summary), [
			section("Decisions", bullets(list(d.decisions))),
			section("Key points", bullets(list(d.keyPoints))),
			section("Action items", tasks(rows(d.actionItems, "task"))),
			section("Open questions", bullets(list(d.openQuestions))),
		]),
};

const oneOnOne: SummaryTemplate = {
	id: "one-on-one",
	name: "1:1",
	useFor: "Manager / report check-ins, mentoring, coaching",
	writes: "topics, wins, concerns, feedback, commitments by person, next check-in",
	prompt: `Template: ONE-ON-ONE.

Goal: a private, factual record both people could agree with, kept neutral and respectful.

Write:
- title: the main topic, at most 8 words.
- summary: 2–3 neutral sentences on how the conversation went and its main outcome.
- topics: the subjects discussed, each with a one-line takeaway.
- wins: progress or achievements mentioned.
- concerns: blockers, worries or risks raised, with who raised them ("Me" or "Others").
- feedback: feedback given in either direction, written factually, with no judgement added.
- commitments: what each person said they would do. owner = "Me", "Others" or a spoken name.
- nextCheckIn: date or topic for the next conversation if mentioned, else null.

Do not diagnose, rate or interpret emotions. Report only what was said.

Schema:
{
  "title": string,
  "summary": string,
  "topics": [{ "topic": string, "takeaway": string }],
  "wins": string[],
  "concerns": [{ "concern": string, "raisedBy": string }],
  "feedback": [{ "from": string, "to": string, "point": string }],
  "commitments": [{ "task": string, "owner": string, "due": string | null }],
  "nextCheckIn": string | null
}`,
	render: (d) => {
		const next = opt(d.nextCheckIn);
		return result(d, line(d.summary), [
			section("Topics", rows(d.topics, "topic").filter((r) => line(r.topic)).map((r) =>
				`- **${line(r.topic)}**${opt(r.takeaway) ? `: ${line(r.takeaway)}` : ""}`)),
			section("Wins", bullets(list(d.wins))),
			section("Concerns", rows(d.concerns, "concern").filter((r) => line(r.concern)).map((r) =>
				`- ${line(r.concern)}${opt(r.raisedBy) ? ` *(${line(r.raisedBy)})*` : ""}`)),
			section("Feedback", rows(d.feedback, "point").filter((r) => line(r.point)).map((r) => {
				const from = opt(r.from);
				const to = opt(r.to);
				return `- ${from && to ? `${from} → ${to}: ` : ""}${line(r.point)}`;
			})),
			section("Commitments", tasks(rows(d.commitments, "task"))),
			next ? ["", `**Next check-in:** ${next}`] : [],
		]);
	},
};

const clientCall: SummaryTemplate = {
	id: "client-call",
	name: "Client call",
	useFor: "Discovery, pre-sales, demos, account reviews",
	writes: "context, needs, pain points, objections, stakeholders, deal signals, next steps, follow-up email",
	hint: "Works best with qwen3:8b.",
	prompt: `Template: CLIENT CALL.
"Me" is on the vendor / consulting side. "Others" is the client or prospect.

Goal: an account-ready recap to update the CRM and prepare the next step.

Write:
- title: client focus + topic, at most 8 words. Use the company name only if spoken.
- summary: 2–4 sentences: why the call happened, where things stand, the agreed next step.
- context: the client's situation (team, current tools, scale, timing) as stated.
- needs: what the client wants to achieve, in their words when possible.
- painPoints: current problems or frustrations.
- objections: concerns, risks or blockers the client raised (budget, security, timing, competition…).
- stakeholders: people or roles mentioned, with their role in the decision if stated.
- signals: buying or risk signals (budget, timeline, urgency, competitors, decision process). Facts only.
- nextSteps: agreed follow-ups. owner = "Me", "Client" or a spoken name. due = as spoken or null.
- followUpEmail: a short, polite recap email draft (max 120 words) from "Me" to the client, in the transcript's language, with no invented details.

Schema:
{
  "title": string,
  "summary": string,
  "context": string[],
  "needs": string[],
  "painPoints": string[],
  "objections": string[],
  "stakeholders": [{ "name": string, "role": string | null }],
  "signals": string[],
  "nextSteps": [{ "task": string, "owner": string, "due": string | null }],
  "followUpEmail": string
}`,
	render: (d) => {
		const email = String(d.followUpEmail ?? "").trim();
		return result(
			d,
			line(d.summary),
			[
				section("Context", bullets(list(d.context))),
				section("Needs", bullets(list(d.needs))),
				section("Pain points", bullets(list(d.painPoints))),
				section("Objections", bullets(list(d.objections))),
				section("Stakeholders", rows(d.stakeholders, "name").filter((r) => line(r.name)).map((r) =>
					`- ${line(r.name)}${opt(r.role) ? ` — ${line(r.role)}` : ""}`)),
				section("Signals", bullets(list(d.signals))),
				section("Next steps", tasks(rows(d.nextSteps, "task"))),
			],
			email ? [callout("example", "Follow-up email draft", email.split(/\r?\n/).map((l) => l.trimEnd()), true)] : [],
		);
	},
};

const lecture: SummaryTemplate = {
	id: "lecture",
	name: "Lecture & learning",
	useFor: "Courses, talks, webinars, tutorials",
	writes: "outline, key concepts, examples, takeaways, references, review questions",
	prompt: `Template: LECTURE.
"Others" is usually the lecturer or video. "Me" may ask questions.

Goal: study notes that let the reader revise the content without replaying the audio.

Write:
- title: the subject of the session, at most 8 words.
- summary: 2–4 sentences on what was taught and why it matters.
- outline: the main sections in the order they were taught, one short line each.
- concepts: key terms with a one-sentence definition as explained in the session.
- examples: concrete examples, cases or demos used to illustrate a concept.
- keyTakeaways: 3–6 things to remember.
- references: books, papers, tools, people or links mentioned by name. Never add your own.
- reviewQuestions: 3–5 questions to test understanding, answerable from the transcript only.
- myQuestions: questions "Me" asked or left unresolved.

Schema:
{
  "title": string,
  "summary": string,
  "outline": string[],
  "concepts": [{ "term": string, "definition": string }],
  "examples": string[],
  "keyTakeaways": string[],
  "references": string[],
  "reviewQuestions": string[],
  "myQuestions": string[]
}`,
	render: (d) => {
		const review = list(d.reviewQuestions);
		const mine = list(d.myQuestions);
		return result(
			d,
			line(d.summary),
			[
				section("Outline", numbered(list(d.outline))),
				section("Key concepts", rows(d.concepts, "term").filter((r) => line(r.term)).map((r) =>
					`- **${line(r.term)}**${opt(r.definition) ? `: ${line(r.definition)}` : ""}`)),
				section("Examples", bullets(list(d.examples))),
				section("Takeaways", bullets(list(d.keyTakeaways))),
				section("References", bullets(list(d.references))),
			],
			review.length || mine.length
				? [callout("question", "Review questions", lead([...bullets(review), ...section("My questions", bullets(mine))]), true)]
				: [],
		);
	},
};

const userInterview: SummaryTemplate = {
	id: "user-interview",
	name: "User interview",
	useFor: "User research, customer interviews, usability tests",
	writes: "profile, goals, pains, insights with evidence, opportunities, quotes, follow-ups",
	hint: "Works best with qwen3:8b.",
	prompt: `Template: USER INTERVIEW.
"Me" is the interviewer. "Others" is the participant.

Goal: evidence-based research notes that can be compared across interviews.

Write:
- title: the participant's main theme, at most 8 words. Never include personal identifying details.
- summary: 2–3 sentences on who the participant is (role/context only) and what stood out.
- profile: role, context, tools and habits as stated by the participant.
- goals: what the participant is trying to achieve.
- pains: frustrations, workarounds and difficulties they describe.
- quotes: 3–6 short verbatim quotes from "Others" (max 25 words each) that best illustrate goals or pains. Copy them exactly.
- insights: patterns or interpretations, each linked to the evidence behind it. Mark the confidence as "high" (stated clearly or repeated) or "low" (implied once).
- opportunities: product or service ideas suggested by the evidence, written as "How might we…".
- followUps: things to verify or ask in later interviews.

Do not put words in the participant's mouth. Keep the interviewer's opinions out of the insights.

Schema:
{
  "title": string,
  "summary": string,
  "profile": string[],
  "goals": string[],
  "pains": string[],
  "quotes": string[],
  "insights": [{ "insight": string, "evidence": string, "confidence": "high" | "low" }],
  "opportunities": string[],
  "followUps": string[]
}`,
	render: (d) => {
		const quotes = list(d.quotes).map((q) => q.replace(/^["“”«»]+|["“”«»]+$/g, "").trim()).filter(Boolean);
		return result(
			d,
			line(d.summary),
			[
				section("Profile", bullets(list(d.profile))),
				section("Goals", bullets(list(d.goals))),
				section("Pains", bullets(list(d.pains))),
				section("Insights", rows(d.insights, "insight").filter((r) => line(r.insight)).map((r) => {
					const meta = [opt(r.evidence) && `evidence: ${line(r.evidence)}`, opt(r.confidence).toLowerCase()].filter(Boolean).join(" · ");
					return `- ${line(r.insight)}${meta ? ` *(${meta})*` : ""}`;
				})),
				section("Opportunities", bullets(list(d.opportunities))),
				section("Follow-ups", list(d.followUps).map((f) => `- [ ] ${f}`)),
			],
			quotes.length ? [callout("quote", "Participant quotes", quotes.map((q) => `- "${q}"`), true)] : [],
		);
	},
};

const voiceMemo: SummaryTemplate = {
	id: "voice-memo",
	name: "Voice memo",
	useFor: "Thinking aloud, ideas, drafting by voice",
	writes: "core idea, ideas, suggested structure, tasks, open questions, tags",
	prompt: `Template: VOICE MEMO.
Usually only "Me" is speaking, thinking aloud.

Goal: turn messy spoken thinking into a clean, reusable note, without losing the author's voice.

Write:
- title: the core idea, at most 8 words.
- coreIdea: the main point in 1–2 sentences, in the first person.
- ideas: distinct ideas, each rewritten as one clear sentence. Merge repetitions; drop false starts and filler.
- structure: if the memo drafts something (an article, a plan, a talk), a suggested outline in order; otherwise [].
- tasks: concrete things "Me" said they need to do, each starting with a verb.
- openQuestions: doubts or questions "Me" raised but did not resolve.
- tags: 2–5 lowercase topic tags without "#", based only on the content (e.g. "product", "hiring").

Keep the author's own wording where it is strong. Do not add new ideas.

Schema:
{
  "title": string,
  "coreIdea": string,
  "ideas": string[],
  "structure": string[],
  "tasks": string[],
  "openQuestions": string[],
  "tags": string[]
}`,
	render: (d) => {
		const tags = list(d.tags)
			.map((t) => t.replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-"))
			.filter(Boolean)
			.slice(0, 5);
		return result(d, line(d.coreIdea), [
			section("Ideas", bullets(list(d.ideas))),
			section("Suggested structure", numbered(list(d.structure))),
			section("Tasks", list(d.tasks).map((t) => `- [ ] ${t}`)),
			section("Open questions", bullets(list(d.openQuestions))),
			tags.length ? ["", tags.map((t) => `#${t}`).join(" ")] : [],
		]);
	},
};

export const TEMPLATES: SummaryTemplate[] = [meeting, oneOnOne, clientCall, lecture, userInterview, voiceMemo];

/* ------------------------------------------------------------------ */
/* User-defined templates                                              */
/* ------------------------------------------------------------------ */

/** A template written by the user in the settings. Stored in data.json. */
export interface CustomTemplateDef {
	id: string;
	name: string;
	useFor: string;
	/** The user's own system-prompt instructions (what to extract and how to write it). */
	prompt: string;
}

const CUSTOM_SCHEMA = `Schema:
{
  "title": string,
  "summary": string,
  "sections": [{ "heading": string, "items": string[] }]
}

Output rules for this template:
- title: specific, at most 8 words.
- summary: 2–4 sentences.
- sections: one entry per part of the note requested above, in the requested order. heading is a short label; items are short, self-contained lines. Leave out a section that has no content.`;

function fromCustom(def: CustomTemplateDef): SummaryTemplate {
	return {
		id: def.id,
		name: def.name,
		useFor: def.useFor || "Custom template",
		writes: "defined by your instructions",
		prompt: `Template: ${def.name.toUpperCase()} (custom).\n\n${def.prompt.trim()}\n\n${CUSTOM_SCHEMA}`,
		render: (d) =>
			result(
				d,
				line(d.summary),
				rows(d.sections, "heading").filter((r) => line(r.heading)).map((r) => section(line(r.heading), bullets(list(r.items)))),
			),
	};
}

let custom: SummaryTemplate[] = [];

/** Replaces the user-defined templates (call after loading / saving settings). */
export function setCustomTemplates(defs: CustomTemplateDef[] | undefined): void {
	custom = (defs ?? []).filter((d) => d && d.id && d.name && d.prompt).map(fromCustom);
}

/** Built-in templates followed by the user's own. */
export function allTemplates(): SummaryTemplate[] {
	return [...TEMPLATES, ...custom];
}

const key = (v: unknown): string => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Builds a unique id (`custom-<slug>`) for a new custom template. */
export function newCustomId(name: string, taken: string[]): string {
	const base = `custom-${key(name) || "template"}`;
	let id = base;
	for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
	return id;
}

/** Finds a template by id or display name ("client-call", "Client call", "1:1"…). */
export function findTemplate(ref: unknown): SummaryTemplate | undefined {
	const k = key(ref);
	return k ? allTemplates().find((t) => t.id === k || key(t.name) === k) : undefined;
}

/** Like `findTemplate`, falling back to the default (Meeting). */
export function getTemplate(ref: unknown): SummaryTemplate {
	return findTemplate(ref) ?? TEMPLATES[0];
}
