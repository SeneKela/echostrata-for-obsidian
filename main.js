"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NoteRecorderPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian7 = require("obsidian");
var path5 = __toESM(require("path"));

// src/settings.ts
var import_obsidian3 = require("obsidian");

// src/devices.ts
var LOOPBACK_RE = /blackhole|loopback|soundflower|ishowu|background music|zoomaudiodevice|ms teams audio/i;
async function listAudioInputs() {
  const read = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  let devices = await read();
  if (devices.length && devices.every((d) => !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      devices = await read();
    } catch (e) {
    }
  }
  return devices;
}
var isAlias = (d) => d.deviceId === "default" || d.deviceId === "communications";
async function resolveSystemDevice(setting) {
  var _a, _b;
  if (setting === "none" || setting === "native") return null;
  const devices = (await listAudioInputs()).filter((d) => !isAlias(d));
  if (setting !== "auto") return (_a = devices.find((d) => d.deviceId === setting)) != null ? _a : null;
  return (_b = devices.find((d) => LOOPBACK_RE.test(d.label))) != null ? _b : null;
}
async function defaultInputIsLoopback() {
  const def = (await listAudioInputs()).find((d) => d.deviceId === "default");
  return !!def && LOOPBACK_RE.test(def.label);
}

// src/transcriber.ts
var fs2 = __toESM(require("fs"));
var os2 = __toESM(require("os"));
var path2 = __toESM(require("path"));

// src/system.ts
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var http = __toESM(require("http"));
var https = __toESM(require("https"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin", "/bin", "/usr/sbin"];
function shellEnv() {
  const env = { ...process.env };
  env.PATH = [...EXTRA_PATH, env.PATH || ""].join(":");
  env.HOMEBREW_NO_AUTO_UPDATE = "1";
  env.HOMEBREW_NO_INSTALL_CLEANUP = "1";
  return env;
}
function findExecutable(names, override) {
  if (override && fs.existsSync(override)) return override;
  const dirs = [...EXTRA_PATH, ...(process.env.PATH || "").split(":")].filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
var findWhisper = (override) => findExecutable(["whisper-cli", "whisper-cpp"], override);
function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.addEventListener("change", () => {
      var _a;
      const file = (_a = input.files) == null ? void 0 : _a[0];
      if (!file) return resolve(null);
      let p = file.path;
      if (!p) {
        try {
          p = window.require("electron").webUtils.getPathForFile(file);
        } catch (e) {
        }
      }
      resolve(p || null);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
var findBrew = () => findExecutable(["brew"]);
function makeWorkDir(id) {
  const dir = path.join(os.tmpdir(), "obsidian-note-recorder", id);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
  }
}
function run(cmd, args, onLine, signal) {
  return new Promise((resolve, reject) => {
    const child = (0, import_child_process.spawn)(cmd, args, { env: shellEnv() });
    const feed = (buf) => buf.toString().split(/\r?\n|\r/).forEach((l) => l.trim() && (onLine == null ? void 0 : onLine(l)));
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("error", reject);
    child.on("close", (code) => resolve(code != null ? code : 1));
    signal == null ? void 0 : signal.addEventListener("abort", () => child.kill("SIGTERM"));
  });
}
function runInTerminal(command) {
  const escaped = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  (0, import_child_process.spawn)("osascript", ["-e", `tell application "Terminal" to activate`, "-e", `tell application "Terminal" to do script "${escaped}"`], {
    env: shellEnv(),
    detached: true
  });
}
function openApp(name) {
  (0, import_child_process.spawn)("open", ["-a", name], { env: shellEnv(), detached: true });
}
function startCaffeinate() {
  try {
    return (0, import_child_process.spawn)("/usr/bin/caffeinate", ["-i", "-m"], { env: shellEnv() });
  } catch (e) {
    return null;
  }
}
function downloadFile(url, dest, onProgress, signal, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error("Too many redirects"));
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { headers: { "User-Agent": "obsidian-note-recorder" } }, (res) => {
      var _a;
      const status = (_a = res.statusCode) != null ? _a : 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        downloadFile(next, dest, onProgress, signal, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`Download failed (HTTP ${status})`));
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const part = dest + ".part";
      const file = fs.createWriteStream(part);
      const total = Number(res.headers["content-length"] || 0);
      let received = 0;
      res.on("data", (c) => {
        received += c.length;
        onProgress(received, total);
      });
      res.pipe(file);
      file.on("finish", () => file.close(() => {
        fs.renameSync(part, dest);
        resolve();
      }));
      const fail = (e) => {
        file.destroy();
        fs.rmSync(part, { force: true });
        reject(e);
      };
      res.on("error", fail);
      file.on("error", fail);
      signal == null ? void 0 : signal.addEventListener("abort", () => {
        req.destroy();
        fail(new Error("Cancelled"));
      });
    });
    req.on("error", reject);
  });
}
function postNdjson(url, body, onJson) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const data = JSON.stringify(body);
    const req = mod.request(
      u,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let buf = "";
        res.on("data", (c) => {
          buf += c.toString();
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line2 = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (line2) {
              try {
                onJson(JSON.parse(line2));
              } catch (e) {
              }
            }
          }
        });
        res.on("end", () => res.statusCode && res.statusCode >= 400 ? reject(new Error(`HTTP ${res.statusCode}`)) : resolve());
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
function formatBytes(n) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + " GB";
  if (n > 1e6) return (n / 1e6).toFixed(0) + " MB";
  return (n / 1e3).toFixed(0) + " KB";
}

// src/transcriber.ts
var WHISPER_MODELS = [
  { id: "base", file: "ggml-base.bin", size: "~150 MB", label: "Base \u2014 fastest, rough quality" },
  { id: "small", file: "ggml-small.bin", size: "~490 MB", label: "Small \u2014 fast, good for English" },
  { id: "large-v3-turbo-q5_0", file: "ggml-large-v3-turbo-q5_0.bin", size: "~570 MB", label: "Large v3 Turbo (q5) \u2014 best balance, multilingual (recommended)" },
  { id: "large-v3-turbo", file: "ggml-large-v3-turbo.bin", size: "~1.6 GB", label: "Large v3 Turbo \u2014 highest quality" }
];
var modelUrl = (m) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${m.file}`;
var getModel = (id) => {
  var _a;
  return (_a = WHISPER_MODELS.find((m) => m.id === id)) != null ? _a : WHISPER_MODELS[2];
};
var NOISE_RE = /^[\s.]*([\[(（【♪*].*[\])）】♪*])?[\s.]*$/;
async function transcribeWav(bin, modelPath, wav, o) {
  var _a, _b, _c, _d, _e, _f;
  const outBase = wav.replace(/\.wav$/, "");
  const threads = o.threads > 0 ? o.threads : Math.max(2, Math.min(8, os2.cpus().length - 2));
  const args = ["-m", modelPath, "-f", wav, "-l", o.language || "auto", "-t", String(threads), "-oj", "-of", outBase, "-pp"];
  const tail = [];
  const code = await run(
    bin,
    args,
    (line2) => {
      var _a2;
      const m = line2.match(/progress\s*=\s*(\d+)%/);
      if (m) (_a2 = o.onProgress) == null ? void 0 : _a2.call(o, Number(m[1]));
      tail.push(line2);
      if (tail.length > 12) tail.shift();
    },
    o.signal
  );
  const jsonPath = outBase + ".json";
  if (code !== 0 || !fs2.existsSync(jsonPath)) {
    throw new Error(`whisper.cpp failed (exit ${code}): ${tail.slice(-3).join(" | ")}`);
  }
  const data = JSON.parse(fs2.readFileSync(jsonPath, "utf8"));
  const segments = [];
  let prev = "";
  for (const s of (_a = data.transcription) != null ? _a : []) {
    const text = String((_b = s.text) != null ? _b : "").trim();
    if (!text || NOISE_RE.test(text) || text === prev) continue;
    prev = text;
    segments.push({ start: (_d = (_c = s.offsets) == null ? void 0 : _c.from) != null ? _d : 0, end: (_f = (_e = s.offsets) == null ? void 0 : _e.to) != null ? _f : 0, text });
  }
  return segments;
}
function toParagraphs(segments) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const out = [];
  let cur = null;
  for (const s of sorted) {
    const sameSpeaker = cur && cur.speaker === s.speaker;
    const closeInTime = cur && s.start - cur.end < 2500;
    if (cur && sameSpeaker && closeInTime && cur.text.length < 700) {
      cur.text += " " + s.text;
      cur.end = Math.max(cur.end, s.end);
    } else {
      if (cur) out.push(cur);
      cur = { start: s.start, end: s.end, speaker: s.speaker, text: s.text };
    }
  }
  if (cur) out.push(cur);
  return out.map(({ start, speaker, text }) => ({ start, speaker, text }));
}
function formatClock(ms) {
  const total = Math.floor(ms / 1e3);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function modelPathFor(modelsDir, id) {
  return path2.join(modelsDir, getModel(id).file);
}

// src/summarizer.ts
var import_obsidian = require("obsidian");

// src/note.ts
var open = (id) => `%%nrt:${id}%%`;
var close = (id) => `%%/nrt:${id}%%`;
var wrap = (id, body) => `${open(id)}
${body}

${close(id)}`;
function callout(type, title, lines = [], folded = false) {
  const head = `> [!${type}]${folded ? "-" : ""} ${title}`;
  return [head, ...lines.map((l) => l ? `> ${l}` : ">")].join("\n");
}
async function insertBlock(app, file, view, id, body, position) {
  const block = wrap(id, body);
  if (position === "cursor" && view && view.file === file && view.getMode() === "source") {
    const editor = view.editor;
    const cur = editor.getCursor();
    const line2 = editor.getLine(cur.line);
    const at = { line: cur.line, ch: line2.length };
    editor.replaceRange((line2.trim() ? "\n\n" : "") + block + "\n", at);
    return;
  }
  await app.vault.process(file, (data) => (data.trim() ? data.replace(/\s*$/, "") + "\n\n" : "") + block + "\n");
}
async function updateBlock(app, file, id, body, final = false) {
  await app.vault.process(file, (data) => {
    const s = data.indexOf(open(id));
    const eIdx = data.indexOf(close(id));
    const replacement = final ? body : wrap(id, body);
    if (s < 0 || eIdx < s) return data.replace(/\s*$/, "") + "\n\n" + replacement + "\n";
    return data.slice(0, s) + replacement + data.slice(eIdx + close(id).length);
  });
}
async function removeBlock(app, file, id) {
  await app.vault.process(file, (data) => {
    const s = data.indexOf(open(id));
    const eIdx = data.indexOf(close(id));
    if (s < 0 || eIdx < s) return data;
    const before = data.slice(0, s).replace(/\n+$/, "");
    const after = data.slice(eIdx + close(id).length).replace(/^\n+/, "");
    return before && after ? `${before}

${after}` : (before || after).replace(/\n*$/, "\n");
  });
}

// src/templates.ts
var BASE_PROMPT = `You turn a recorded conversation transcript into structured notes for an Obsidian vault.

Speakers:
- "Me" is the person who recorded (their microphone).
- "Others" is everyone heard through the computer (call participants, a lecturer, a video).
- "Others" can be several people. Use real names only if they are said in the transcript.

Rules:
1. Write in the SAME LANGUAGE as the transcript.
2. Use only what is in the transcript. Never invent names, numbers, dates, owners or decisions.
3. If something is unclear, leave it out or list it as an open question.
4. Be concise: short sentences, no filler, no "the speaker said that\u2026".
5. Keep numbers, dates, product names and proper nouns exactly as spoken.
6. Transcripts have recognition errors. Fix obvious ones silently; never guess at unclear ones.
7. Return ONLY one valid JSON object that matches the schema below. No Markdown, no comments, no text before or after.
8. If a list has nothing to put in it, return an empty array [].`;
var line = (v) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
var opt = (v) => {
  const t = line(v);
  return /^(null|none|n\/a|unknown|undefined)$/i.test(t) ? "" : t;
};
var list = (v) => Array.isArray(v) ? v.map(line).filter(Boolean) : [];
var rows = (v, key2) => Array.isArray(v) ? v.flatMap((x) => typeof x === "string" ? x.trim() ? [{ [key2]: x }] : [] : x && typeof x === "object" && !Array.isArray(x) ? [x] : []) : [];
var bullets = (items) => items.map((i) => `- ${i}`);
var numbered = (items) => items.map((i, n) => `${n + 1}. ${i}`);
var section = (heading, items) => items.length ? ["", `**${heading}**`, ...items] : [];
var lead = (lines) => {
  const out = [...lines];
  while (out.length && !out[0]) out.shift();
  return out;
};
var owner = (who, due) => {
  const o = opt(who);
  const d = opt(due);
  return (o ? ` \u2014 ${o}` : "") + (d ? ` \xB7 \u{1F4C5} ${d}` : "");
};
var tasks = (items) => items.filter((r) => line(r.task)).map((r) => `- [ ] ${line(r.task)}${owner(r.owner, r.due)}`);
function result(d, intro, sections, extra = []) {
  const title = line(d.title);
  return { title, blocks: [callout("abstract", title || "Summary", lead([intro, ...sections.flat()])), ...extra] };
}
var meeting = {
  id: "meeting",
  name: "Meeting",
  useFor: "Team meetings, syncs, workshops",
  writes: "summary, decisions, key points, action items, open questions",
  prompt: `Template: MEETING.

Goal: someone who missed the meeting understands in 30 seconds what was decided and who does what next.

Write:
- title: specific, at most 8 words (e.g. "Q4 roadmap: search before sharing"), not "Meeting notes".
- summary: 2\u20134 sentences: purpose, main outcome, what is still open.
- decisions: things that were clearly agreed. Not suggestions.
- keyPoints: 3\u20137 important facts, figures or arguments that are not decisions.
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
  render: (d) => result(d, line(d.summary), [
    section("Decisions", bullets(list(d.decisions))),
    section("Key points", bullets(list(d.keyPoints))),
    section("Action items", tasks(rows(d.actionItems, "task"))),
    section("Open questions", bullets(list(d.openQuestions)))
  ])
};
var oneOnOne = {
  id: "one-on-one",
  name: "1:1",
  useFor: "Manager / report check-ins, mentoring, coaching",
  writes: "topics, wins, concerns, feedback, commitments by person, next check-in",
  prompt: `Template: ONE-ON-ONE.

Goal: a private, factual record both people could agree with, kept neutral and respectful.

Write:
- title: the main topic, at most 8 words.
- summary: 2\u20133 neutral sentences on how the conversation went and its main outcome.
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
      section("Topics", rows(d.topics, "topic").filter((r) => line(r.topic)).map((r) => `- **${line(r.topic)}**${opt(r.takeaway) ? `: ${line(r.takeaway)}` : ""}`)),
      section("Wins", bullets(list(d.wins))),
      section("Concerns", rows(d.concerns, "concern").filter((r) => line(r.concern)).map((r) => `- ${line(r.concern)}${opt(r.raisedBy) ? ` *(${line(r.raisedBy)})*` : ""}`)),
      section("Feedback", rows(d.feedback, "point").filter((r) => line(r.point)).map((r) => {
        const from = opt(r.from);
        const to = opt(r.to);
        return `- ${from && to ? `${from} \u2192 ${to}: ` : ""}${line(r.point)}`;
      })),
      section("Commitments", tasks(rows(d.commitments, "task"))),
      next ? ["", `**Next check-in:** ${next}`] : []
    ]);
  }
};
var clientCall = {
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
- summary: 2\u20134 sentences: why the call happened, where things stand, the agreed next step.
- context: the client's situation (team, current tools, scale, timing) as stated.
- needs: what the client wants to achieve, in their words when possible.
- painPoints: current problems or frustrations.
- objections: concerns, risks or blockers the client raised (budget, security, timing, competition\u2026).
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
    var _a;
    const email = String((_a = d.followUpEmail) != null ? _a : "").trim();
    return result(
      d,
      line(d.summary),
      [
        section("Context", bullets(list(d.context))),
        section("Needs", bullets(list(d.needs))),
        section("Pain points", bullets(list(d.painPoints))),
        section("Objections", bullets(list(d.objections))),
        section("Stakeholders", rows(d.stakeholders, "name").filter((r) => line(r.name)).map((r) => `- ${line(r.name)}${opt(r.role) ? ` \u2014 ${line(r.role)}` : ""}`)),
        section("Signals", bullets(list(d.signals))),
        section("Next steps", tasks(rows(d.nextSteps, "task")))
      ],
      email ? [callout("example", "Follow-up email draft", email.split(/\r?\n/).map((l) => l.trimEnd()), true)] : []
    );
  }
};
var lecture = {
  id: "lecture",
  name: "Lecture & learning",
  useFor: "Courses, talks, webinars, tutorials",
  writes: "outline, key concepts, examples, takeaways, references, review questions",
  prompt: `Template: LECTURE.
"Others" is usually the lecturer or video. "Me" may ask questions.

Goal: study notes that let the reader revise the content without replaying the audio.

Write:
- title: the subject of the session, at most 8 words.
- summary: 2\u20134 sentences on what was taught and why it matters.
- outline: the main sections in the order they were taught, one short line each.
- concepts: key terms with a one-sentence definition as explained in the session.
- examples: concrete examples, cases or demos used to illustrate a concept.
- keyTakeaways: 3\u20136 things to remember.
- references: books, papers, tools, people or links mentioned by name. Never add your own.
- reviewQuestions: 3\u20135 questions to test understanding, answerable from the transcript only.
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
        section("Key concepts", rows(d.concepts, "term").filter((r) => line(r.term)).map((r) => `- **${line(r.term)}**${opt(r.definition) ? `: ${line(r.definition)}` : ""}`)),
        section("Examples", bullets(list(d.examples))),
        section("Takeaways", bullets(list(d.keyTakeaways))),
        section("References", bullets(list(d.references)))
      ],
      review.length || mine.length ? [callout("question", "Review questions", lead([...bullets(review), ...section("My questions", bullets(mine))]), true)] : []
    );
  }
};
var userInterview = {
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
- summary: 2\u20133 sentences on who the participant is (role/context only) and what stood out.
- profile: role, context, tools and habits as stated by the participant.
- goals: what the participant is trying to achieve.
- pains: frustrations, workarounds and difficulties they describe.
- quotes: 3\u20136 short verbatim quotes from "Others" (max 25 words each) that best illustrate goals or pains. Copy them exactly.
- insights: patterns or interpretations, each linked to the evidence behind it. Mark the confidence as "high" (stated clearly or repeated) or "low" (implied once).
- opportunities: product or service ideas suggested by the evidence, written as "How might we\u2026".
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
          const meta = [opt(r.evidence) && `evidence: ${line(r.evidence)}`, opt(r.confidence).toLowerCase()].filter(Boolean).join(" \xB7 ");
          return `- ${line(r.insight)}${meta ? ` *(${meta})*` : ""}`;
        })),
        section("Opportunities", bullets(list(d.opportunities))),
        section("Follow-ups", list(d.followUps).map((f) => `- [ ] ${f}`))
      ],
      quotes.length ? [callout("quote", "Participant quotes", quotes.map((q) => `- "${q}"`), true)] : []
    );
  }
};
var voiceMemo = {
  id: "voice-memo",
  name: "Voice memo",
  useFor: "Thinking aloud, ideas, drafting by voice",
  writes: "core idea, ideas, suggested structure, tasks, open questions, tags",
  prompt: `Template: VOICE MEMO.
Usually only "Me" is speaking, thinking aloud.

Goal: turn messy spoken thinking into a clean, reusable note, without losing the author's voice.

Write:
- title: the core idea, at most 8 words.
- coreIdea: the main point in 1\u20132 sentences, in the first person.
- ideas: distinct ideas, each rewritten as one clear sentence. Merge repetitions; drop false starts and filler.
- structure: if the memo drafts something (an article, a plan, a talk), a suggested outline in order; otherwise [].
- tasks: concrete things "Me" said they need to do, each starting with a verb.
- openQuestions: doubts or questions "Me" raised but did not resolve.
- tags: 2\u20135 lowercase topic tags without "#", based only on the content (e.g. "product", "hiring").

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
    const tags = list(d.tags).map((t) => t.replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-")).filter(Boolean).slice(0, 5);
    return result(d, line(d.coreIdea), [
      section("Ideas", bullets(list(d.ideas))),
      section("Suggested structure", numbered(list(d.structure))),
      section("Tasks", list(d.tasks).map((t) => `- [ ] ${t}`)),
      section("Open questions", bullets(list(d.openQuestions))),
      tags.length ? ["", tags.map((t) => `#${t}`).join(" ")] : []
    ]);
  }
};
var TEMPLATES = [meeting, oneOnOne, clientCall, lecture, userInterview, voiceMemo];
var CUSTOM_SCHEMA = `Schema:
{
  "title": string,
  "summary": string,
  "sections": [{ "heading": string, "items": string[] }]
}

Output rules for this template:
- title: specific, at most 8 words.
- summary: 2\u20134 sentences.
- sections: one entry per part of the note requested above, in the requested order. heading is a short label; items are short, self-contained lines. Leave out a section that has no content.`;
function fromCustom(def) {
  return {
    id: def.id,
    name: def.name,
    useFor: def.useFor || "Custom template",
    writes: "defined by your instructions",
    prompt: `Template: ${def.name.toUpperCase()} (custom).

${def.prompt.trim()}

${CUSTOM_SCHEMA}`,
    render: (d) => result(
      d,
      line(d.summary),
      rows(d.sections, "heading").filter((r) => line(r.heading)).map((r) => section(line(r.heading), bullets(list(r.items))))
    )
  };
}
var custom = [];
function setCustomTemplates(defs) {
  custom = (defs != null ? defs : []).filter((d) => d && d.id && d.name && d.prompt).map(fromCustom);
}
function allTemplates() {
  return [...TEMPLATES, ...custom];
}
var key = (v) => String(v != null ? v : "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function newCustomId(name, taken) {
  const base = `custom-${key(name) || "template"}`;
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
function findTemplate(ref) {
  const k = key(ref);
  return k ? allTemplates().find((t) => t.id === k || key(t.name) === k) : void 0;
}
function getTemplate(ref) {
  var _a;
  return (_a = findTemplate(ref)) != null ? _a : TEMPLATES[0];
}

// src/summarizer.ts
var MAX_CHARS = 6e4;
var RETRY_NOTE = "Your previous answer was not valid JSON. Return only the JSON object.";
var userMessage = (ctx, transcript) => `Note: ${ctx.noteTitle}
Date: ${ctx.date} \xB7 Duration: ${ctx.duration} \xB7 Speakers: ${ctx.speakers}

Transcript:
"""
${transcript.length > MAX_CHARS ? transcript.slice(0, MAX_CHARS) + "\n[\u2026transcript truncated: it was too long to include in full]" : transcript}
"""`;
async function listOllamaModels(baseUrl) {
  var _a;
  try {
    const res = await (0, import_obsidian.requestUrl)({ url: `${baseUrl.replace(/\/$/, "")}/api/tags`, throw: false });
    if (res.status !== 200) return null;
    return ((_a = res.json.models) != null ? _a : []).map((m) => {
      var _a2, _b, _c;
      return {
        name: String((_a2 = m.name) != null ? _a2 : m.model),
        size: Number((_b = m.size) != null ? _b : 0),
        parameterSize: ((_c = m.details) == null ? void 0 : _c.parameter_size) ? String(m.details.parameter_size) : void 0
      };
    }).filter((m) => !!m.name).sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    return null;
  }
}
function modelLabel(m) {
  const meta = [m.parameterSize, m.size ? formatBytes(m.size) : ""].filter(Boolean).join(" \xB7 ");
  return meta ? `${m.name}  (${meta})` : m.name;
}
function matchInstalled(names, wanted) {
  if (names.includes(wanted)) return wanted;
  if (!wanted.includes(":") && names.includes(`${wanted}:latest`)) return `${wanted}:latest`;
  if (wanted.endsWith(":latest") && names.includes(wanted.slice(0, -7))) return wanted.slice(0, -7);
  return null;
}
async function chat(baseUrl, model, system, user) {
  var _a, _b;
  const res = await (0, import_obsidian.requestUrl)({
    url: `${baseUrl.replace(/\/$/, "")}/api/chat`,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      stream: false,
      format: "json",
      think: false,
      options: { temperature: 0.2, num_ctx: 32768 }
    }),
    throw: false
  });
  if (res.status !== 200) throw new Error(`Ollama returned HTTP ${res.status}`);
  const raw = String((_b = (_a = res.json.message) == null ? void 0 : _a.content) != null ? _b : "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Model did not return a JSON object");
  return parsed;
}
async function summarize(baseUrl, model, template, ctx, transcript) {
  const system = `${BASE_PROMPT}

${template.prompt}`;
  const user = userMessage(ctx, transcript);
  try {
    return await chat(baseUrl, model, system, user);
  } catch (e) {
    if (!(e instanceof SyntaxError) && !String(e.message).startsWith("Model did not")) throw e;
    return chat(baseUrl, model, `${system}

${RETRY_NOTE}`, user);
  }
}

// src/template-modal.ts
var import_obsidian2 = require("obsidian");
var TemplateModal = class extends import_obsidian2.FuzzySuggestModal {
  constructor(app, onPick) {
    super(app);
    this.onPick = onPick;
    this.setPlaceholder("Choose a summary template for this recording\u2026");
  }
  getItems() {
    return allTemplates();
  }
  getItemText(t) {
    return `${t.name} \u2014 ${t.useFor}`;
  }
  onChooseItem(t) {
    this.onPick(t);
  }
};
var PROMPT_PLACEHOLDER = `Goal: a short recap of a sales call for my CRM.

Write:
- painPoints: problems the client mentioned.
- budget: anything said about budget or timing.
- nextSteps: agreed follow-ups, each starting with a verb.`;
var TemplateEditModal = class extends import_obsidian2.Modal {
  constructor(app, existing, takenIds, onSave) {
    var _a, _b, _c;
    super(app);
    this.existing = existing;
    this.takenIds = takenIds;
    this.onSave = onSave;
    this.name = (_a = existing == null ? void 0 : existing.name) != null ? _a : "";
    this.useFor = (_b = existing == null ? void 0 : existing.useFor) != null ? _b : "";
    this.prompt = (_c = existing == null ? void 0 : existing.prompt) != null ? _c : "";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(this.existing ? "Edit template" : "New template");
    new import_obsidian2.Setting(contentEl).setName("Name").addText((t) => t.setPlaceholder("Sales call").setValue(this.name).onChange((v) => this.name = v));
    new import_obsidian2.Setting(contentEl).setName("Use for").setDesc("Optional short description.").addText((t) => t.setPlaceholder("Discovery calls").setValue(this.useFor).onChange((v) => this.useFor = v));
    new import_obsidian2.Setting(contentEl).setName("Instructions").setDesc("Say what to extract and how to write it. The model returns a title, a summary and sections \u2014 you don't need to describe the JSON format.");
    const area = contentEl.createEl("textarea", { cls: "nrt-prompt", attr: { rows: "10", placeholder: PROMPT_PLACEHOLDER } });
    area.value = this.prompt;
    area.addEventListener("input", () => this.prompt = area.value);
    new import_obsidian2.Setting(contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton((b) => b.setButtonText("Save").setCta().onClick(async () => {
      var _a, _b;
      const name = this.name.trim();
      const prompt = this.prompt.trim();
      if (!name || !prompt) {
        new import_obsidian2.Notice("A template needs a name and instructions.");
        return;
      }
      const id = (_b = (_a = this.existing) == null ? void 0 : _a.id) != null ? _b : newCustomId(name, [...this.takenIds, ...allTemplates().map((t) => t.id)]);
      await this.onSave({ id, name, useFor: this.useFor.trim(), prompt });
      this.close();
    }));
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/native-audio.ts
var import_child_process2 = require("child_process");
var fs3 = __toESM(require("fs"));
var os3 = __toESM(require("os"));
var path3 = __toESM(require("path"));
var HELPER_VERSION = 1;
var HELPER_NAME = `nrt-system-audio-v${HELPER_VERSION}`;
var SWIFT_SOURCE = String.raw`
import Foundation
import AVFoundation
import CoreMedia
import ScreenCaptureKit

signal(SIGPIPE, SIG_IGN)

func logLine(_ s: String) {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

func writeAll(_ base: UnsafeRawPointer, _ count: Int) {
    var off = 0
    while off < count {
        let r = Darwin.write(1, base + off, count - off)
        if r < 0 { if errno == EINTR { continue }; exit(0) }
        if r == 0 { exit(0) }
        off += r
    }
}

@available(macOS 13.0, *)
final class SystemAudioCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    private var scStream: SCStream?
    private let audioQueue = DispatchQueue(label: "nrt.audio")
    private let screenQueue = DispatchQueue(label: "nrt.screen")
    private var mono = [Float]()
    private var warned = false
    let sampleRate = 48000

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first else {
            throw NSError(domain: "nrt", code: 1, userInfo: [NSLocalizedDescriptionKey: "No display found"])
        }
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let cfg = SCStreamConfiguration()
        cfg.capturesAudio = true
        cfg.excludesCurrentProcessAudio = true
        cfg.sampleRate = sampleRate
        cfg.channelCount = 2
        cfg.width = 2
        cfg.height = 2
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        cfg.showsCursor = false
        let s = SCStream(filter: filter, configuration: cfg, delegate: self)
        try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue)
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: screenQueue)
        try await s.startCapture()
        scStream = s
        logLine("READY \(sampleRate)")
    }

    func stop() async {
        try? await scStream?.stopCapture()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio, CMSampleBufferIsValid(sb) else { return }
        guard let fd = CMSampleBufferGetFormatDescription(sb),
              let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(fd) else { return }
        let asbd = asbdPtr.pointee
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0 && asbd.mBitsPerChannel == 32
        if !isFloat {
            if !warned { logLine("WARN unsupported audio format"); warned = true }
            return
        }
        let n = Int(CMSampleBufferGetNumSamples(sb))
        if n <= 0 { return }

        var needed = 0
        var st = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sb, bufferListSizeNeededOut: &needed, bufferListOut: nil, bufferListSize: 0,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: nil)
        guard st == noErr, needed > 0 else { return }
        let raw = UnsafeMutableRawPointer.allocate(byteCount: needed, alignment: 16)
        defer { raw.deallocate() }
        let abl = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
        var block: CMBlockBuffer?
        st = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sb, bufferListSizeNeededOut: nil, bufferListOut: abl, bufferListSize: needed,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: UInt32(kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment), blockBufferOut: &block)
        guard st == noErr else { return }
        let buffers = UnsafeMutableAudioBufferListPointer(abl)

        if mono.count < n { mono = [Float](repeating: 0, count: n) }
        mono.withUnsafeMutableBufferPointer { out in
            for i in 0..<n { out[i] = 0 }
            if buffers.count > 1 {
                let scale = 1 / Float(buffers.count)
                for b in buffers {
                    guard let d = b.mData else { continue }
                    let p = d.assumingMemoryBound(to: Float.self)
                    let m = min(n, Int(b.mDataByteSize) / 4)
                    for i in 0..<m { out[i] += p[i] * scale }
                }
            } else if let b = buffers.first, let d = b.mData {
                let ch = max(1, Int(b.mNumberChannels))
                let p = d.assumingMemoryBound(to: Float.self)
                let m = min(n, Int(b.mDataByteSize) / 4 / ch)
                let scale = 1 / Float(ch)
                for i in 0..<m {
                    var s: Float = 0
                    for c in 0..<ch { s += p[i * ch + c] }
                    out[i] = s * scale
                }
            }
            writeAll(UnsafeRawPointer(out.baseAddress!), n * 4)
        }
        _ = block
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let ns = error as NSError
        logLine("ERROR \(ns.code) \(ns.localizedDescription)")
        exit(4)
    }
}

@available(macOS 13.0, *)
func runCapture() {
    let capture = SystemAudioCapture()
    let finish = {
        DispatchQueue.global().asyncAfter(deadline: .now() + 1.5) { exit(0) }
        Task { await capture.stop(); exit(0) }
    }
    Task {
        do { try await capture.start() }
        catch {
            let ns = error as NSError
            logLine("ERROR \(ns.code) \(ns.localizedDescription)")
            exit(2)
        }
    }
    signal(SIGTERM, SIG_IGN)
    let term = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    term.setEventHandler { finish() }
    term.resume()
    // Parent closes stdin to stop us (and if Obsidian quits, stdin hits EOF too).
    Thread.detachNewThread {
        while readLine() != nil {}
        finish()
    }
    withExtendedLifetime(term) { dispatchMain() }
}

if #available(macOS 13.0, *) {
    runCapture()
} else {
    logLine("ERROR 0 macOS 13 (Ventura) or later is required")
    exit(3)
}
`;
function nativeSupported() {
  return process.platform === "darwin" && parseInt(os3.release().split(".")[0], 10) >= 22;
}
function helperPath(pluginDir) {
  return path3.join(pluginDir, "bin", HELPER_NAME);
}
function helperBuilt(pluginDir) {
  return fs3.existsSync(helperPath(pluginDir));
}
async function canBuildHelper() {
  if (process.platform !== "darwin") return false;
  const code = await run("/usr/bin/xcode-select", ["-p"]).catch(() => 1);
  return code === 0;
}
var building = null;
function buildHelper(pluginDir, onLine) {
  if (building) return building;
  building = (async () => {
    const out = helperPath(pluginDir);
    fs3.mkdirSync(path3.dirname(out), { recursive: true });
    const src = path3.join(os3.tmpdir(), `${HELPER_NAME}.swift`);
    fs3.writeFileSync(src, SWIFT_SOURCE);
    const tail = [];
    const code = await run(
      "/usr/bin/xcrun",
      ["swiftc", "-O", "-swift-version", "5", "-o", out + ".tmp", src],
      (l) => {
        tail.push(l);
        if (tail.length > 8) tail.shift();
        onLine == null ? void 0 : onLine(l);
      }
    );
    if (code !== 0 || !fs3.existsSync(out + ".tmp")) {
      throw new Error(`Building the system-audio helper failed: ${tail.slice(-3).join(" | ") || "exit " + code}`);
    }
    fs3.renameSync(out + ".tmp", out);
    fs3.chmodSync(out, 493);
    return out;
  })().finally(() => {
    building = null;
  });
  return building;
}
var NativeAudioError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  get isPermission() {
    return this.code === -3801 || /declin|permission|not authori[sz]ed|TCC/i.test(this.message);
  }
};
var PERMISSION_HELP = "Allow Obsidian in System Settings \u2192 Privacy & Security \u2192 Screen & System Audio Recording, then quit and reopen Obsidian.";
function openScreenRecordingSettings() {
  void run("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"]).catch(() => void 0);
}
var NativeSystemAudio = class {
  constructor(bin) {
    this.bin = bin;
    this.proc = null;
    this.rest = null;
    this.rate = 48e3;
    this.onData = null;
  }
  start(timeoutMs = 1e4) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          this.stop();
          reject(err);
        } else resolve(this.rate);
      };
      const timer = setTimeout(
        () => done(new NativeAudioError(-1, "System-audio capture did not start (macOS permission prompt pending?). " + PERMISSION_HELP)),
        timeoutMs
      );
      const proc = (0, import_child_process2.spawn)(this.bin, [], { env: shellEnv(), stdio: ["pipe", "pipe", "pipe"] });
      this.proc = proc;
      let errBuf = "";
      proc.stderr.on("data", (b) => {
        errBuf += b.toString();
        let i;
        while ((i = errBuf.indexOf("\n")) >= 0) {
          const line2 = errBuf.slice(0, i).trim();
          errBuf = errBuf.slice(i + 1);
          const ready = line2.match(/^READY (\d+)/);
          const err = line2.match(/^ERROR (-?\d+) (.*)$/);
          if (ready) {
            this.rate = Number(ready[1]);
            done(null);
          } else if (err) {
            const e = new NativeAudioError(Number(err[1]), err[2]);
            if (e.isPermission) e.message = "macOS blocked system-audio capture. " + PERMISSION_HELP;
            done(e);
          } else if (line2) console.debug("[note-recorder helper]", line2);
        }
      });
      proc.stdout.on("data", (b) => this.handle(b));
      proc.on("error", (e) => done(e));
      proc.on("exit", (code) => {
        this.proc = null;
        done(new NativeAudioError(code != null ? code : -1, `System-audio helper exited (code ${code}).`));
      });
    });
  }
  handle(chunk) {
    const buf = this.rest ? Buffer.concat([this.rest, chunk]) : chunk;
    const usable = buf.length - buf.length % 4;
    this.rest = usable < buf.length ? Buffer.from(buf.subarray(usable)) : null;
    if (!usable || !this.onData) return;
    const f32 = new Float32Array(usable / 4);
    new Uint8Array(f32.buffer).set(buf.subarray(0, usable));
    this.onData(f32);
  }
  stop() {
    var _a;
    const p = this.proc;
    if (!p) return;
    this.proc = null;
    this.onData = null;
    try {
      (_a = p.stdin) == null ? void 0 : _a.end();
    } catch (e) {
    }
    setTimeout(() => {
      if (p.exitCode === null) p.kill("SIGKILL");
    }, 2500);
  }
};
async function testNative(bin, ms = 4e3) {
  const cap = new NativeSystemAudio(bin);
  let peak2 = 0;
  cap.onData = (f) => {
    for (let i = 0; i < f.length; i++) {
      const v = Math.abs(f[i]);
      if (v > peak2) peak2 = v;
    }
  };
  await cap.start();
  await new Promise((r) => setTimeout(r, ms));
  cap.stop();
  return peak2;
}

// src/settings.ts
var DEFAULT_SETTINGS = {
  recordingsFolder: "",
  insertPosition: "cursor",
  micDeviceId: "default",
  systemDeviceId: "native",
  micEchoCancellation: true,
  micGain: 1,
  systemGain: 1,
  whisperPath: "",
  whisperModel: "large-v3-turbo-q5_0",
  language: "auto",
  threads: 0,
  labelSpeakers: true,
  micSpeakerName: "Me",
  systemSpeakerName: "Others",
  showTimestamps: true,
  transcriptFolded: true,
  summaryEnabled: true,
  summaryTemplate: "meeting",
  customTemplates: [],
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "qwen3:4b",
  keepAwake: true,
  setupSeen: false,
  settingsVersion: 2
};
var LANGUAGES = {
  auto: "Auto-detect",
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  ja: "Japanese",
  zh: "Chinese"
};
var dB = (p) => p > 0 ? `${(20 * Math.log10(p)).toFixed(0)} dB` : "-\u221E dB";
async function testSystemAudio(plugin) {
  const s = plugin.settings;
  if (s.systemDeviceId === "none") return "System audio is set to Off.";
  let peak2;
  let source;
  if (s.systemDeviceId === "native") {
    if (!nativeSupported()) throw new Error("Built-in capture needs macOS 13 or later \u2014 choose BlackHole instead.");
    const dir = plugin.pluginDir;
    if (!helperBuilt(dir)) {
      if (!await canBuildHelper()) throw new Error("Install Xcode Command Line Tools first (setup assistant).");
      new import_obsidian3.Notice("Preparing built-in capture (one time, ~30 s)\u2026", 5e3);
      await buildHelper(dir);
    }
    peak2 = await testNative(helperPath(dir));
    source = "Built-in macOS capture";
  } else {
    const dev = await resolveSystemDevice(s.systemDeviceId);
    if (!dev) throw new Error("No loopback device (BlackHole) found.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: dev.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    peak2 = 0;
    const end = Date.now() + 4e3;
    while (Date.now() < end) {
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) peak2 = Math.max(peak2, Math.abs(buf[i]));
      await new Promise((r) => setTimeout(r, 40));
    }
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    source = dev.label;
  }
  if (peak2 > 3e-3) return `\u2705 ${source}: system audio received (peak ${dB(peak2)}).`;
  return s.systemDeviceId === "native" ? `\u26A0\uFE0F ${source} is running but heard silence. Is something playing? If so, check Privacy & Security \u2192 Screen & System Audio Recording \u2192 Obsidian, then restart Obsidian.` : `\u26A0\uFE0F ${source} heard silence. Set System Settings \u2192 Sound \u2192 Output to a Multi-Output Device that includes ${source} \u2014 or switch to "Built-in macOS capture".`;
}
var RecorderSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.ollamaEl = null;
  }
  display() {
    void this.render();
  }
  async render() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();
    containerEl.addClass("nrt-settings");
    new import_obsidian3.Setting(containerEl).setName("Setup assistant").setDesc("Checks microphone access, system audio, whisper.cpp, speech model and Ollama.").addButton((b) => b.setButtonText("Open setup").setCta().onClick(() => this.plugin.openSetup()));
    new import_obsidian3.Setting(containerEl).setName("Audio sources").setHeading();
    const devices = await listAudioInputs().catch(() => []);
    const real = devices.filter((d) => d.deviceId !== "default" && d.deviceId !== "communications");
    new import_obsidian3.Setting(containerEl).setName("Microphone").setDesc("Your voice. Avoid choosing a loopback device here.").addDropdown((d) => {
      d.addOption("default", "System default");
      real.filter((x) => !LOOPBACK_RE.test(x.label)).forEach((x) => d.addOption(x.deviceId, x.label || "Microphone"));
      d.setValue(s.micDeviceId).onChange(async (v) => {
        s.micDeviceId = v;
        await save();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("System audio (Mac)").setDesc("What your Mac plays (Zoom, Teams, browser\u2026). Built-in capture needs no driver; macOS asks once for Screen & System Audio Recording permission.").addDropdown((d) => {
      d.addOption("native", "Built-in macOS capture (recommended)");
      d.addOption("auto", "BlackHole / Loopback device (auto-detect)");
      d.addOption("none", "Off \u2014 microphone only");
      real.forEach((x) => d.addOption(x.deviceId, x.label || "Input"));
      d.setValue(s.systemDeviceId).onChange(async (v) => {
        s.systemDeviceId = v;
        await save();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Test system audio").setDesc("Play something (e.g. a YouTube video), then click Test. Listens for 4 seconds.").addButton((b) => b.setButtonText("Test").onClick(async () => {
      b.setDisabled(true).setButtonText("Listening\u2026");
      try {
        new import_obsidian3.Notice(await testSystemAudio(this.plugin), 1e4);
      } catch (e) {
        new import_obsidian3.Notice(`System audio test failed: ${e.message}`, 12e3);
        if (e instanceof NativeAudioError && e.isPermission) openScreenRecordingSettings();
      } finally {
        b.setDisabled(false).setButtonText("Test");
      }
    }));
    new import_obsidian3.Setting(containerEl).setName("Microphone echo cancellation").setDesc("Keep on when using speakers. Headphones give the cleanest speaker separation.").addToggle((t) => t.setValue(s.micEchoCancellation).onChange(async (v) => {
      s.micEchoCancellation = v;
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Microphone level").addSlider((sl) => sl.setLimits(0.2, 3, 0.1).setValue(s.micGain).setDynamicTooltip().onChange(async (v) => {
      s.micGain = v;
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("System audio level").addSlider((sl) => sl.setLimits(0.2, 3, 0.1).setValue(s.systemGain).setDynamicTooltip().onChange(async (v) => {
      s.systemGain = v;
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Notes").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Insert recording at").addDropdown((d) => d.addOption("cursor", "Cursor position").addOption("end", "End of note").setValue(s.insertPosition).onChange(async (v) => {
      s.insertPosition = v;
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Recordings folder").setDesc("Leave empty to follow Obsidian's attachment settings.").addText((t) => t.setPlaceholder("Recordings").setValue(s.recordingsFolder).onChange(async (v) => {
      s.recordingsFolder = v.trim();
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Transcription").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Speech model").setDesc("Downloaded once into the plugin folder. Runs offline on your Mac.").addDropdown((d) => {
      WHISPER_MODELS.forEach((m) => d.addOption(m.id, `${m.label} (${m.size})`));
      d.setValue(s.whisperModel).onChange(async (v) => {
        s.whisperModel = v;
        await save();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Language").addDropdown((d) => {
      Object.entries(LANGUAGES).forEach(([k, v]) => d.addOption(k, v));
      d.setValue(s.language).onChange(async (v) => {
        s.language = v;
        await save();
      });
    });
    new import_obsidian3.Setting(containerEl).setName("Label speakers").setDesc("Transcribe microphone and system audio separately and label who spoke.").addToggle((t) => t.setValue(s.labelSpeakers).onChange(async (v) => {
      s.labelSpeakers = v;
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Speaker names").setDesc("Microphone / system audio").addText((t) => t.setPlaceholder("Me").setValue(s.micSpeakerName).onChange(async (v) => {
      s.micSpeakerName = v || "Me";
      await save();
    })).addText((t) => t.setPlaceholder("Others").setValue(s.systemSpeakerName).onChange(async (v) => {
      s.systemSpeakerName = v || "Others";
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Show timestamps").addToggle((t) => t.setValue(s.showTimestamps).onChange(async (v) => {
      s.showTimestamps = v;
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Fold transcript callout").addToggle((t) => t.setValue(s.transcriptFolded).onChange(async (v) => {
      s.transcriptFolded = v;
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("whisper.cpp binary").setDesc("Leave empty to auto-detect Homebrew's whisper-cli.").addText((t) => t.setPlaceholder("/opt/homebrew/bin/whisper-cli").setValue(s.whisperPath).onChange(async (v) => {
      s.whisperPath = v.trim();
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("CPU threads").setDesc("0 = automatic").addText((t) => t.setValue(String(s.threads)).onChange(async (v) => {
      s.threads = Math.max(0, parseInt(v) || 0);
      await save();
    }));
    new import_obsidian3.Setting(containerEl).setName("Summary (Ollama, optional)").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Generate a summary").addToggle((t) => t.setValue(s.summaryEnabled).onChange(async (v) => {
      s.summaryEnabled = v;
      await save();
    }));
    const templateSetting = new import_obsidian3.Setting(containerEl).setName("Summary template");
    const describeTemplate = () => {
      const t = getTemplate(s.summaryTemplate);
      templateSetting.setDesc(
        `${t.useFor}. Writes: ${t.writes}.${t.hint ? " " + t.hint : ""} Override per recording with \u201CRecord with template\u2026\u201D, or set echostrata-template in the note's properties.`
      );
    };
    templateSetting.addDropdown((d) => {
      var _a, _b;
      const templates = allTemplates();
      templates.forEach((t) => d.addOption(t.id, t.name));
      d.setValue((_b = (_a = findTemplate(s.summaryTemplate)) == null ? void 0 : _a.id) != null ? _b : templates[0].id).onChange(async (v) => {
        s.summaryTemplate = v;
        describeTemplate();
        await save();
      });
    });
    describeTemplate();
    const customHeader = new import_obsidian3.Setting(containerEl).setName("Custom templates").setDesc("Write your own instructions for the summary. They appear next to the built-in templates.").addButton((b) => b.setButtonText("Add template").onClick(() => {
      new TemplateEditModal(this.app, null, s.customTemplates.map((c) => c.id), async (def) => {
        s.customTemplates.push(def);
        await this.saveTemplates();
        this.display();
      }).open();
    }));
    customHeader.settingEl.addClass("nrt-tpl-header");
    for (const def of s.customTemplates) {
      new import_obsidian3.Setting(containerEl).setName(def.name).setDesc(def.useFor || "Custom template").addExtraButton((b) => b.setIcon("pencil").setTooltip("Edit").onClick(() => {
        new TemplateEditModal(this.app, def, [], async (updated) => {
          Object.assign(def, updated, { id: def.id });
          await this.saveTemplates();
          this.display();
        }).open();
      })).addExtraButton((b) => b.setIcon("trash").setTooltip("Delete").onClick(async () => {
        s.customTemplates = s.customTemplates.filter((c) => c.id !== def.id);
        if (s.summaryTemplate === def.id) s.summaryTemplate = DEFAULT_SETTINGS.summaryTemplate;
        await this.saveTemplates();
        this.display();
      }));
    }
    new import_obsidian3.Setting(containerEl).setName("Ollama URL").setDesc("The model list below refreshes when you leave this field.").addText((t) => {
      t.setValue(s.ollamaUrl).onChange(async (v) => {
        s.ollamaUrl = v.trim() || DEFAULT_SETTINGS.ollamaUrl;
        await save();
      });
      t.inputEl.addEventListener("blur", () => void this.renderOllamaModel());
    });
    this.ollamaEl = containerEl.createDiv();
    void this.renderOllamaModel();
    new import_obsidian3.Setting(containerEl).setName("Other").setHeading();
    new import_obsidian3.Setting(containerEl).setName("Keep Mac awake").setDesc("Prevents idle sleep while recording and transcribing.").addToggle((t) => t.setValue(s.keepAwake).onChange(async (v) => {
      s.keepAwake = v;
      await save();
    }));
  }
  async saveTemplates() {
    setCustomTemplates(this.plugin.settings.customTemplates);
    await this.plugin.saveSettings();
  }
  /** Dropdown of every model installed in Ollama (falls back to a text field when Ollama is offline). */
  async renderOllamaModel() {
    const host = this.ollamaEl;
    if (!host) return;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    host.empty();
    new import_obsidian3.Setting(host).setName("Ollama model").setDesc("Loading installed models\u2026");
    const models = await listOllamaModels(s.ollamaUrl);
    if (host !== this.ollamaEl) return;
    host.empty();
    const setting = new import_obsidian3.Setting(host).setName("Ollama model");
    if (models && models.length) {
      const current = matchInstalled(models.map((m) => m.name), s.ollamaModel);
      setting.setDesc(`${models.length} model${models.length > 1 ? "s" : ""} installed in Ollama.`).addDropdown((d) => {
        if (!current) d.addOption(s.ollamaModel, `${s.ollamaModel} \u2014 not installed`);
        models.forEach((m) => d.addOption(m.name, modelLabel(m)));
        d.setValue(current != null ? current : s.ollamaModel).onChange(async (v) => {
          s.ollamaModel = v;
          await save();
          void this.renderOllamaModel();
        });
      });
      if (current && current !== s.ollamaModel) {
        s.ollamaModel = current;
        await save();
      }
    } else {
      setting.setDesc(models ? "Ollama is running but has no models. Download one from the setup assistant, then refresh." : "Ollama is not reachable \u2014 start Ollama, then refresh. You can still type a model name.").addText((t) => t.setPlaceholder("qwen3:4b").setValue(s.ollamaModel).onChange(async (v) => {
        s.ollamaModel = v.trim() || DEFAULT_SETTINGS.ollamaModel;
        await save();
      }));
    }
    setting.addExtraButton((b) => b.setIcon("refresh-cw").setTooltip("Refresh model list").onClick(() => void this.renderOllamaModel()));
  }
};

// src/session.ts
var import_obsidian4 = require("obsidian");
var fs5 = __toESM(require("fs"));

// src/recorder.ts
var path4 = __toESM(require("path"));

// src/resampler.ts
var Resampler = class {
  constructor(inRate, outRate) {
    this.ratio = inRate / outRate;
    this.t = 0;
    this.last = 0;
    this.lp1 = 0;
    this.lp2 = 0;
    this.tmp = null;
    const fc = Math.min(outRate, inRate) * 0.45;
    this.alpha = this.ratio > 1 ? 1 - Math.exp(-2 * Math.PI * fc / inRate) : 1;
  }
  /** Resample `x` into `out` starting at `offset`. Returns the new write offset. */
  process(x, out, offset) {
    const n = x.length;
    if (!n) return offset;
    if (!this.tmp || this.tmp.length < n) this.tmp = new Float32Array(n);
    const y = this.tmp;
    const a = this.alpha;
    let l1 = this.lp1;
    let l2 = this.lp2;
    for (let i = 0; i < n; i++) {
      l1 += a * (x[i] - l1);
      l2 += a * (l1 - l2);
      y[i] = l2;
    }
    this.lp1 = l1;
    this.lp2 = l2;
    let o = offset;
    let t = this.t;
    while (t < n - 1 && o < out.length) {
      const i = Math.floor(t);
      const f = t - i;
      const s0 = i < 0 ? this.last : y[i];
      const s1 = y[i + 1];
      out[o++] = s0 + (s1 - s0) * f;
      t += this.ratio;
    }
    this.t = t - n;
    this.last = y[n - 1];
    return o;
  }
};

// src/wav.ts
var fs4 = __toESM(require("fs"));
var WavWriter = class {
  constructor(path6, rate) {
    this.path = path6;
    this.rate = rate;
    this.dataBytes = 0;
    this.pending = [];
    this.pendingBytes = 0;
    this.activeSamples = 0;
    this.closed = false;
    this.fd = fs4.openSync(path6, "w");
    fs4.writeSync(this.fd, this.header(0));
  }
  write(samples) {
    if (this.closed || !samples.length) return;
    const pcm = new Int16Array(samples.length);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      sum += s * s;
      pcm[i] = s < 0 ? s * 32768 : s * 32767;
    }
    if (Math.sqrt(sum / samples.length) > 0.01) this.activeSamples += samples.length;
    const buf = Buffer.from(pcm.buffer);
    this.pending.push(buf);
    this.pendingBytes += buf.length;
    this.dataBytes += buf.length;
    if (this.pendingBytes > 64 * 1024) this.flush();
  }
  /** True when the channel contains at least ~1.5 s of non-silent audio. */
  get hasAudio() {
    return this.activeSamples / this.rate >= 1.5;
  }
  flush() {
    if (!this.pending.length) return;
    fs4.writeSync(this.fd, Buffer.concat(this.pending));
    this.pending = [];
    this.pendingBytes = 0;
  }
  close() {
    if (this.closed) return;
    this.flush();
    fs4.writeSync(this.fd, this.header(this.dataBytes), 0, 44, 0);
    fs4.closeSync(this.fd);
    this.closed = true;
  }
  header(dataBytes) {
    const b = Buffer.alloc(44);
    b.write("RIFF", 0);
    b.writeUInt32LE(36 + dataBytes, 4);
    b.write("WAVE", 8);
    b.write("fmt ", 12);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(this.rate, 24);
    b.writeUInt32LE(this.rate * 2, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write("data", 36);
    b.writeUInt32LE(dataBytes, 40);
    return b;
  }
};

// src/recorder.ts
var TARGET_RATE = 16e3;
var TAP_NAME = "nrt-tap";
var FEED_NAME = "nrt-feed";
function pickMime() {
  const candidates = [
    ["audio/mp4;codecs=mp4a.40.2", "m4a"],
    ["audio/mp4", "m4a"],
    ["audio/webm;codecs=opus", "webm"],
    ["audio/webm", "webm"]
  ];
  for (const [mime, ext] of candidates) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return { mime: "", ext: "webm" };
}
function workletSource() {
  return `
const Resampler = (${Resampler.toString()});
class NrtTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const target = options.processorOptions.targetRate;
    this.rs = [new Resampler(sampleRate, target), new Resampler(sampleRate, target)];
    this.out = [new Float32Array(8192), new Float32Array(8192)];
    this.len = 0;
    this.peak = [0, 0];
    this.flushAt = Math.round(target * 0.064);
    this.zeros = new Float32Array(128);
  }
  process(inputs) {
    const input = inputs[0] || [];
    const n = input[0] ? input[0].length : 128;
    if (this.zeros.length !== n) this.zeros = new Float32Array(n);
    const a = input[0] || this.zeros;
    const b = input[1] || this.zeros;
    for (let c = 0; c < 2; c++) {
      const x = c === 0 ? a : b; let p = this.peak[c];
      for (let i = 0; i < x.length; i++) { const v = x[i] < 0 ? -x[i] : x[i]; if (v > p) p = v; }
      this.peak[c] = p;
    }
    const next = this.rs[0].process(a, this.out[0], this.len);
    this.rs[1].process(b, this.out[1], this.len);
    this.len = next;
    if (this.len >= this.flushAt) {
      const mic = this.out[0].slice(0, this.len);
      const sys = this.out[1].slice(0, this.len);
      this.port.postMessage({ mic, sys, micPeak: this.peak[0], sysPeak: this.peak[1] }, [mic.buffer, sys.buffer]);
      this.len = 0; this.peak = [0, 0];
    }
    return true;
  }
}
registerProcessor("${TAP_NAME}", NrtTap);

class NrtFeed extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = []; this.off = 0; this.queued = 0; this.primed = false;
    this.prime = Math.round(sampleRate * 0.06);
    this.max = Math.round(sampleRate * 0.3);
    this.port.onmessage = (e) => {
      if (e.data === "flush") { this.q = []; this.off = 0; this.queued = 0; this.primed = false; return; }
      this.q.push(e.data); this.queued += e.data.length;
      while (this.queued > this.max && this.q.length > 1) {
        const d = this.q.shift(); this.queued -= d.length - this.off; this.off = 0;
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!this.primed) { if (this.queued < this.prime) return true; this.primed = true; }
    let i = 0;
    while (i < out.length && this.q.length) {
      const h = this.q[0];
      const n = Math.min(out.length - i, h.length - this.off);
      out.set(h.subarray(this.off, this.off + n), i);
      i += n; this.off += n; this.queued -= n;
      if (this.off >= h.length) { this.q.shift(); this.off = 0; }
    }
    if (i < out.length) this.primed = false;
    return true;
  }
}
registerProcessor("${FEED_NAME}", NrtFeed);`;
}
var AudioRecorder = class {
  constructor(o) {
    this.o = o;
    this.ctx = null;
    this.streams = [];
    this.mediaRecorder = null;
    this.chunks = [];
    this.tap = null;
    this.micWriter = null;
    this.sysWriter = null;
    this.mixWriter = null;
    this.ext = "webm";
    this.startedAt = 0;
    this.pausedAt = 0;
    this.pausedTotal = 0;
    this.closed = false;
    this.native = null;
    this.feed = null;
    this.workletReady = false;
    this.hasSystem = false;
    /** Set when the requested system source could not be opened. */
    this.systemError = null;
  }
  get paused() {
    return this.pausedAt > 0;
  }
  get elapsedMs() {
    if (!this.startedAt) return 0;
    const now = this.pausedAt || performance.now();
    return Math.max(0, now - this.startedAt - this.pausedTotal);
  }
  async start() {
    var _a, _b;
    const o = this.o;
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: o.micDeviceId && o.micDeviceId !== "default" ? { exact: o.micDeviceId } : void 0,
        echoCancellation: o.micEchoCancellation,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    this.streams.push(mic);
    let sys = null;
    if (((_a = o.system) == null ? void 0 : _a.kind) === "native") {
      const native = new NativeSystemAudio(o.system.bin);
      try {
        await native.start();
        this.native = native;
      } catch (e) {
        this.systemError = e;
      }
    } else if (((_b = o.system) == null ? void 0 : _b.kind) === "device") {
      try {
        sys = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: o.system.deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2
          }
        });
        this.streams.push(sys);
      } catch (e) {
        this.systemError = new Error("System audio device unavailable.");
      }
    }
    const ctx = new AudioContext({ latencyHint: "interactive", sampleRate: this.native ? this.native.rate : void 0 });
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    await this.loadWorklet(ctx);
    if (this.native && !this.workletReady) {
      this.native.stop();
      this.native = null;
      this.systemError = new Error("AudioWorklet unavailable \u2014 cannot use built-in system audio capture.");
    }
    this.hasSystem = !!sys || !!this.native;
    const merger = ctx.createChannelMerger(2);
    const recDest = ctx.createMediaStreamDestination();
    recDest.channelCount = 1;
    const micGain = this.monoGain(ctx, o.micGain);
    ctx.createMediaStreamSource(mic).connect(micGain);
    micGain.connect(merger, 0, 0);
    micGain.connect(recDest);
    if (this.hasSystem) {
      const sysGain = this.monoGain(ctx, o.systemGain);
      if (sys) {
        ctx.createMediaStreamSource(sys).connect(sysGain);
      } else {
        const feed = new AudioWorkletNode(ctx, FEED_NAME, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        this.feed = feed;
        this.native.onData = (f32) => feed.port.postMessage(f32, [f32.buffer]);
        feed.connect(sysGain);
      }
      sysGain.connect(merger, 0, 1);
      sysGain.connect(recDest);
    }
    this.micWriter = new WavWriter(path4.join(o.workDir, "mic.wav"), TARGET_RATE);
    this.mixWriter = new WavWriter(path4.join(o.workDir, "mix.wav"), TARGET_RATE);
    if (this.hasSystem) this.sysWriter = new WavWriter(path4.join(o.workDir, "system.wav"), TARGET_RATE);
    this.tap = this.createTap(ctx);
    merger.connect(this.tap);
    this.tap.connect(ctx.destination);
    const { mime, ext } = pickMime();
    this.ext = ext;
    this.mediaRecorder = new MediaRecorder(recDest.stream, {
      mimeType: mime || void 0,
      audioBitsPerSecond: 96e3
    });
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(1e3);
    this.startedAt = performance.now();
  }
  monoGain(ctx, value) {
    const g = ctx.createGain();
    g.gain.value = value;
    g.channelCount = 1;
    g.channelCountMode = "explicit";
    g.channelInterpretation = "speakers";
    return g;
  }
  async loadWorklet(ctx) {
    try {
      const url = URL.createObjectURL(new Blob([workletSource()], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.workletReady = true;
    } catch (e) {
      console.warn("[note-recorder] AudioWorklet unavailable", e);
    }
  }
  createTap(ctx) {
    if (this.workletReady) {
      const node = new AudioWorkletNode(ctx, TAP_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 2,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        processorOptions: { targetRate: TARGET_RATE }
      });
      node.port.onmessage = (e) => this.handleChunk(e.data.mic, e.data.sys, e.data.micPeak, e.data.sysPeak);
      return node;
    }
    const sp = ctx.createScriptProcessor(4096, 2, 1);
    sp.channelInterpretation = "discrete";
    const rs = [new Resampler(ctx.sampleRate, TARGET_RATE), new Resampler(ctx.sampleRate, TARGET_RATE)];
    sp.onaudioprocess = (ev) => {
      const ib = ev.inputBuffer;
      const a = ib.getChannelData(0);
      const b = ib.numberOfChannels > 1 ? ib.getChannelData(1) : new Float32Array(a.length);
      const cap = Math.ceil(a.length / rs[0].ratio) + 4;
      const mo = new Float32Array(cap);
      const so = new Float32Array(cap);
      const n = rs[0].process(a, mo, 0);
      rs[1].process(b, so, 0);
      this.handleChunk(mo.subarray(0, n), so.subarray(0, n), peak(a), peak(b));
    };
    return sp;
  }
  handleChunk(mic, sys, micPeak, sysPeak) {
    var _a, _b, _c, _d;
    if (this.closed || this.paused) return;
    (_a = this.micWriter) == null ? void 0 : _a.write(mic);
    if (this.sysWriter) this.sysWriter.write(sys);
    const mix = new Float32Array(mic.length);
    for (let i = 0; i < mic.length; i++) mix[i] = mic[i] + (this.hasSystem ? sys[i] : 0);
    (_b = this.mixWriter) == null ? void 0 : _b.write(mix);
    (_d = (_c = this.o).onLevel) == null ? void 0 : _d.call(_c, micPeak, this.hasSystem ? sysPeak : -1);
  }
  pause() {
    var _a;
    if (!this.mediaRecorder || this.paused) return;
    this.mediaRecorder.pause();
    void ((_a = this.ctx) == null ? void 0 : _a.suspend());
    this.pausedAt = performance.now();
  }
  resume() {
    var _a, _b;
    if (!this.mediaRecorder || !this.paused) return;
    this.pausedTotal += performance.now() - this.pausedAt;
    this.pausedAt = 0;
    (_a = this.feed) == null ? void 0 : _a.port.postMessage("flush");
    void ((_b = this.ctx) == null ? void 0 : _b.resume());
    this.mediaRecorder.resume();
  }
  async stop() {
    var _a, _b, _c, _d;
    const durationMs = this.elapsedMs;
    const mr = this.mediaRecorder;
    const blob = await new Promise((resolve) => {
      const done = () => resolve(new Blob(this.chunks, { type: (mr == null ? void 0 : mr.mimeType) || "audio/webm" }));
      if (!mr || mr.state === "inactive") return done();
      mr.onstop = done;
      mr.stop();
    });
    const result2 = {
      blob,
      extension: this.ext,
      durationMs,
      micWav: this.micWriter.path,
      sysWav: (_b = (_a = this.sysWriter) == null ? void 0 : _a.path) != null ? _b : null,
      mixWav: this.mixWriter.path,
      micHasAudio: this.micWriter.hasAudio,
      sysHasAudio: (_d = (_c = this.sysWriter) == null ? void 0 : _c.hasAudio) != null ? _d : false
    };
    await this.teardown();
    return result2;
  }
  /** Releases devices without producing a result. */
  async cancel() {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") this.mediaRecorder.stop();
    } catch (e) {
    }
    await this.teardown();
  }
  async teardown() {
    var _a, _b;
    this.closed = true;
    (_a = this.native) == null ? void 0 : _a.stop();
    this.native = null;
    (_b = this.feed) == null ? void 0 : _b.disconnect();
    if (this.tap) {
      if (this.tap instanceof AudioWorkletNode) this.tap.port.onmessage = null;
      if (this.tap instanceof ScriptProcessorNode) this.tap.onaudioprocess = null;
      this.tap.disconnect();
    }
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    [this.micWriter, this.sysWriter, this.mixWriter].forEach((w) => w == null ? void 0 : w.close());
    if (this.ctx && this.ctx.state !== "closed") await this.ctx.close();
  }
};
function peak(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > p) p = v;
  }
  return p;
}

// src/session.ts
var newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function isoDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function stamp(d = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}
var RecordingSession = class {
  constructor(plugin, file, view, templateId) {
    this.plugin = plugin;
    this.file = file;
    this.view = view;
    this.templateId = templateId;
    this.id = newId();
    this.startedAt = /* @__PURE__ */ new Date();
    this.phase = "starting";
    this.recorder = null;
    this.workDir = makeWorkDir(this.id);
  }
  /** Template that will be used: explicit choice, else the note's `echostrata-template`, else the setting. */
  get activeTemplate() {
    var _a, _b, _c, _d;
    const fm = (_b = (_a = this.plugin.app.metadataCache.getFileCache(this.file)) == null ? void 0 : _a.frontmatter) == null ? void 0 : _b["echostrata-template"];
    return getTemplate((_d = (_c = this.templateId) != null ? _c : fm) != null ? _d : this.plugin.settings.summaryTemplate);
  }
  get elapsedMs() {
    var _a, _b;
    return (_b = (_a = this.recorder) == null ? void 0 : _a.elapsedMs) != null ? _b : 0;
  }
  get hasSystem() {
    var _a;
    return !!((_a = this.recorder) == null ? void 0 : _a.hasSystem);
  }
  async start() {
    var _a;
    const { app, settings: s } = this.plugin;
    await insertBlock(app, this.file, this.view, this.id, callout("danger", "\u{1F534} Recording in progress\u2026"), s.insertPosition);
    try {
      const system = await this.resolveSystem();
      if (s.micDeviceId === "default" && await defaultInputIsLoopback()) {
        new import_obsidian4.Notice("Your macOS default input is a loopback device. Pick your real microphone in Note Recorder settings.", 8e3);
      }
      this.recorder = new AudioRecorder({
        micDeviceId: s.micDeviceId,
        system,
        micEchoCancellation: s.micEchoCancellation,
        micGain: s.micGain,
        systemGain: s.systemGain,
        workDir: this.workDir,
        onLevel: (m, sy) => this.plugin.ui.onLevel(m, sy)
      });
      await this.recorder.start();
      const err = this.recorder.systemError;
      if (err) {
        new import_obsidian4.Notice(`System audio not captured \u2014 recording microphone only.
${err.message}`, 12e3);
        if (err instanceof NativeAudioError && err.isPermission) openScreenRecordingSettings();
      } else if (!system && s.systemDeviceId !== "none") {
        new import_obsidian4.Notice("No system-audio source available \u2014 recording microphone only. Open the setup assistant.", 8e3);
      }
      this.phase = "recording";
    } catch (e) {
      await ((_a = this.recorder) == null ? void 0 : _a.cancel());
      await removeBlock(app, this.file, this.id);
      removeDir(this.workDir);
      throw e;
    }
  }
  /** Turns the "System audio" setting into a concrete source, building the native helper if needed. */
  async resolveSystem() {
    const s = this.plugin.settings;
    if (s.systemDeviceId === "none") return null;
    if (s.systemDeviceId === "native") {
      if (nativeSupported()) {
        const dir = this.plugin.pluginDir;
        if (helperBuilt(dir)) return { kind: "native", bin: helperPath(dir) };
        if (await canBuildHelper()) {
          const n = new import_obsidian4.Notice("Preparing built-in system-audio capture (one time, ~30 s)\u2026", 0);
          try {
            return { kind: "native", bin: await buildHelper(dir) };
          } catch (e) {
            new import_obsidian4.Notice(e.message, 1e4);
          } finally {
            n.hide();
          }
        } else {
          new import_obsidian4.Notice("Built-in system audio needs Xcode Command Line Tools \u2014 open the setup assistant.", 8e3);
        }
      }
      const dev2 = await resolveSystemDevice("auto");
      return dev2 ? { kind: "device", deviceId: dev2.deviceId } : null;
    }
    const dev = await resolveSystemDevice(s.systemDeviceId);
    return dev ? { kind: "device", deviceId: dev.deviceId } : null;
  }
  pause() {
    var _a;
    if (this.phase !== "recording") return;
    (_a = this.recorder) == null ? void 0 : _a.pause();
    this.phase = "paused";
  }
  resume() {
    var _a;
    if (this.phase !== "paused") return;
    (_a = this.recorder) == null ? void 0 : _a.resume();
    this.phase = "recording";
  }
  async stop() {
    this.phase = "stopping";
    const result2 = await this.recorder.stop();
    return new ProcessingJob(this.plugin, this.file, this.id, this.startedAt, this.workDir, result2, this.templateId);
  }
  async cancel() {
    var _a;
    this.phase = "stopping";
    await ((_a = this.recorder) == null ? void 0 : _a.cancel());
    await removeBlock(this.plugin.app, this.file, this.id).catch(() => void 0);
    removeDir(this.workDir);
  }
};
var ProcessingJob = class {
  constructor(plugin, file, id, startedAt, workDir, rec, templateId) {
    this.plugin = plugin;
    this.file = file;
    this.id = id;
    this.startedAt = startedAt;
    this.workDir = workDir;
    this.rec = rec;
    this.templateId = templateId;
    this.phase = "saving";
    this.progress = 0;
    // 0..100
    this.message = "Saving audio\u2026";
    this.embed = "";
  }
  /** Template chosen for this recording, else the note's `echostrata-template` frontmatter, else the setting. */
  resolveTemplate() {
    var _a, _b, _c, _d;
    const fm = (_b = (_a = this.plugin.app.metadataCache.getFileCache(this.file)) == null ? void 0 : _a.frontmatter) == null ? void 0 : _b["echostrata-template"];
    return getTemplate((_d = (_c = this.templateId) != null ? _c : fm) != null ? _d : this.plugin.settings.summaryTemplate);
  }
  set(phase, message, progress = this.progress) {
    this.phase = phase;
    this.message = message;
    this.progress = progress;
    this.plugin.ui.refresh();
  }
  async run() {
    const { app, settings: s } = this.plugin;
    try {
      const audio = await this.saveAudio();
      this.embed = "!" + app.fileManager.generateMarkdownLink(audio, this.file.path);
      await updateBlock(app, this.file, this.id, `${this.embed}

${callout("info", "\u23F3 Transcribing\u2026")}`);
      const bin = findWhisper(s.whisperPath);
      const model = modelPathFor(this.plugin.modelsDir, s.whisperModel);
      if (!bin || !fs5.existsSync(model)) {
        throw new Error("Transcription is not set up yet \u2014 open Settings \u2192 Note Recorder \u2192 Open setup.");
      }
      this.set("transcribing", "Transcribing\u2026", 0);
      const paragraphs = await this.transcribe(bin, model);
      let summary = null;
      if (s.summaryEnabled && paragraphs.length) {
        this.set("summarizing", "Writing summary\u2026", 100);
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
              speakers: [...new Set(paragraphs.map((p) => p.speaker).filter(Boolean))].join(", ") || s.micSpeakerName
            },
            plain(paragraphs)
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
      await updateBlock(app, this.file, this.id, body, true).catch(() => void 0);
      new import_obsidian4.Notice(`Note Recorder: ${msg}`, 8e3);
    } finally {
      removeDir(this.workDir);
      this.plugin.onJobFinished(this);
    }
  }
  async saveAudio() {
    const { app, settings: s } = this.plugin;
    const name = `Recording ${stamp(this.startedAt)}.${this.rec.extension}`;
    let target;
    if (s.recordingsFolder) {
      const folder = (0, import_obsidian4.normalizePath)(s.recordingsFolder);
      if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
      target = (0, import_obsidian4.normalizePath)(`${folder}/${name}`);
    } else {
      target = await app.fileManager.getAvailablePathForAttachment(name, this.file.path);
    }
    return app.vault.createBinary(target, await this.rec.blob.arrayBuffer());
  }
  async transcribe(bin, model) {
    const s = this.plugin.settings;
    const r = this.rec;
    let tasks2;
    if (s.labelSpeakers && r.sysWav && r.micHasAudio && r.sysHasAudio) {
      tasks2 = [
        { wav: r.micWav, speaker: s.micSpeakerName },
        { wav: r.sysWav, speaker: s.systemSpeakerName }
      ];
    } else if (r.micHasAudio || r.sysHasAudio) {
      tasks2 = [{ wav: r.mixWav }];
    } else {
      return [];
    }
    const all = [];
    for (let i = 0; i < tasks2.length; i++) {
      const t = tasks2[i];
      const label = tasks2.length > 1 ? `Transcribing ${t.speaker}\u2026` : "Transcribing\u2026";
      this.set("transcribing", label, Math.round(i / tasks2.length * 100));
      const segs = await transcribeWav(bin, model, t.wav, {
        language: s.language,
        threads: s.threads,
        onProgress: (p) => {
          const overall = Math.round((i + p / 100) / tasks2.length * 100);
          if (overall !== this.progress) this.set("transcribing", label, overall);
        }
      });
      segs.forEach((seg) => all.push({ ...seg, speaker: t.speaker }));
    }
    return toParagraphs(all);
  }
  render(paragraphs, summary) {
    const s = this.plugin.settings;
    const parts = [this.embed];
    if (summary) parts.push(...summary.blocks);
    const speakers = [...new Set(paragraphs.map((p) => p.speaker).filter(Boolean))];
    const title = `Transcript \xB7 ${formatClock(this.rec.durationMs)}${speakers.length ? " \xB7 " + speakers.join(" / ") : ""}`;
    const body = paragraphs.length ? paragraphs.flatMap((p, i) => {
      const ts = s.showTimestamps ? `\`${formatClock(p.start)}\` ` : "";
      const who = p.speaker ? `**${p.speaker}:** ` : "";
      return i ? ["", `${ts}${who}${p.text}`] : [`${ts}${who}${p.text}`];
    }) : ["*No speech detected.*"];
    parts.push(callout("quote", title, body, s.transcriptFolded));
    return parts.join("\n\n");
  }
};
function plain(paragraphs) {
  return paragraphs.map((p) => p.speaker ? `${p.speaker}: ${p.text}` : p.text).join("\n");
}

// src/ui.ts
var import_obsidian5 = require("obsidian");
var WAVE_BARS = 48;
function putIcon(el, icon) {
  el.empty();
  (0, import_obsidian5.setIcon)(el, icon);
  const svgs = el.querySelectorAll("svg");
  for (let i = 0; i < svgs.length - 1; i++) svgs[i].remove();
}
var NoteUI = class {
  constructor(plugin, ribbonEl, statusEl) {
    this.plugin = plugin;
    this.ribbonEl = ribbonEl;
    this.statusEl = statusEl;
    this.actions = /* @__PURE__ */ new Map();
    this.bars = /* @__PURE__ */ new Map();
    this.ticker = null;
    this.ribbonIcon = "";
    this.statusEl.addClass("nrt-status");
    this.statusEl.addEventListener("click", () => this.plugin.toggleRecording());
  }
  refresh() {
    var _a;
    const views = this.plugin.app.workspace.getLeavesOfType("markdown").map((l) => l.view).filter((v) => v instanceof import_obsidian5.MarkdownView);
    for (const [v, a] of this.actions) if (!views.includes(v)) {
      a.destroy();
      this.actions.delete(v);
    }
    for (const [v, bar] of this.bars) if (!views.includes(v)) {
      bar.destroy();
      this.bars.delete(v);
    }
    const session = this.plugin.session;
    for (const v of views) {
      let action = this.actions.get(v);
      if (!action || !action.el.isConnected) {
        action == null ? void 0 : action.destroy();
        action = new HeaderAction(this.plugin, v);
        this.actions.set(v, action);
      }
      action.render();
      const path6 = (_a = v.file) == null ? void 0 : _a.path;
      const job = path6 ? this.plugin.jobs.find((j) => j.file.path === path6) : void 0;
      const wants = !!path6 && ((session == null ? void 0 : session.file.path) === path6 || !!job);
      let bar = this.bars.get(v);
      if (bar && (!wants || bar.path !== path6)) {
        bar.destroy();
        this.bars.delete(v);
        bar = void 0;
      }
      if (wants && !bar) {
        bar = new RecordingBar(v.contentEl, this.plugin, path6);
        this.bars.set(v, bar);
      }
      bar == null ? void 0 : bar.render();
    }
    this.renderRibbon();
    this.renderStatus();
    this.ensureTicker();
  }
  /** Called ~15×/s by the recorder with peak levels (0..1). sys = -1 when not captured. */
  onLevel(mic, sys) {
    var _a;
    const path6 = (_a = this.plugin.session) == null ? void 0 : _a.file.path;
    for (const bar of this.bars.values()) if (bar.path === path6) bar.pushLevel(mic, sys);
  }
  get isRecording() {
    var _a;
    const p = (_a = this.plugin.session) == null ? void 0 : _a.phase;
    return p === "recording" || p === "paused";
  }
  renderRibbon() {
    const icon = this.isRecording ? "square" : "mic";
    this.ribbonEl.toggleClass("nrt-recording", this.isRecording);
    if (icon !== this.ribbonIcon) {
      this.ribbonIcon = icon;
      putIcon(this.ribbonEl, icon);
    }
    this.ribbonEl.setAttr("aria-label", this.isRecording ? "Stop recording" : "Start recording in current note");
  }
  renderStatus() {
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
  ensureTicker() {
    const needs = !!this.plugin.session;
    if (needs && this.ticker === null) {
      this.ticker = window.setInterval(() => this.tick(), 250);
    } else if (!needs && this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
  }
  tick() {
    for (const a of this.actions.values()) a.tick();
    for (const bar of this.bars.values()) bar.tick();
    this.renderStatus();
  }
  destroy() {
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.actions.forEach((a) => a.destroy());
    this.bars.forEach((b) => b.destroy());
    this.actions.clear();
    this.bars.clear();
  }
};
var HeaderAction = class {
  constructor(plugin, view) {
    this.plugin = plugin;
    this.icon = "";
    view.containerEl.querySelectorAll(".nrt-action").forEach((n) => n.remove());
    this.el = view.addAction("mic", "Start recording", () => this.plugin.toggleRecording(view));
    this.el.addClass("nrt-action");
    this.el.empty();
    this.iconEl = this.el.createSpan({ cls: "nrt-action-icon" });
    this.timeEl = this.el.createSpan({ cls: "nrt-action-time" });
  }
  render() {
    const session = this.plugin.session;
    const phase = session == null ? void 0 : session.phase;
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
  tick() {
    const session = this.plugin.session;
    if (session) this.timeEl.setText(formatClock(session.elapsedMs));
  }
  destroy() {
    this.el.remove();
  }
};
var RecordingBar = class {
  constructor(host, plugin, path6) {
    this.host = host;
    this.plugin = plugin;
    this.path = path6;
    this.key = "";
    this.timeEl = null;
    this.canvas = null;
    this.micFill = null;
    this.sysFill = null;
    this.progressFill = null;
    this.progressText = null;
    this.history = new Float32Array(WAVE_BARS);
    this.drawPending = false;
    host.addClass("nrt-host");
    this.el = host.createDiv({ cls: "nrt-bar" });
    this.el.setAttr("role", "status");
  }
  render() {
    var _a;
    const session = ((_a = this.plugin.session) == null ? void 0 : _a.file.path) === this.path ? this.plugin.session : null;
    const job = this.plugin.jobs.find((j) => j.file.path === this.path);
    const key2 = session ? `rec:${session.phase}:${session.hasSystem}` : job ? `job:${job.phase}` : "none";
    if (key2 !== this.key) {
      this.key = key2;
      this.build();
    }
    this.tick();
  }
  build() {
    var _a;
    const el = this.el;
    el.empty();
    this.timeEl = this.canvas = this.micFill = this.sysFill = this.progressFill = this.progressText = null;
    const session = ((_a = this.plugin.session) == null ? void 0 : _a.file.path) === this.path ? this.plugin.session : null;
    const job = this.plugin.jobs.find((j) => j.file.path === this.path);
    el.dataset.state = session ? session.phase : job ? job.phase : "none";
    if (session) {
      if (session.phase === "starting" || session.phase === "stopping") {
        el.createSpan({ cls: "nrt-spinner" });
        el.createSpan({ cls: "nrt-label", text: session.phase === "starting" ? "Starting microphone\u2026" : "Saving recording\u2026" });
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
      this.button(btns, session.phase === "paused" ? "play" : "pause", session.phase === "paused" ? "Resume" : "Pause", "", () => this.plugin.togglePause());
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
      const wrap2 = el.createDiv({ cls: "nrt-progress" });
      this.progressText = wrap2.createSpan({ cls: "nrt-label" });
      const track = wrap2.createDiv({ cls: "nrt-track" });
      this.progressFill = track.createDiv({ cls: "nrt-fill" });
      if (job.phase !== "transcribing") track.addClass("nrt-indeterminate");
    }
  }
  tick() {
    var _a;
    const session = ((_a = this.plugin.session) == null ? void 0 : _a.file.path) === this.path ? this.plugin.session : null;
    if (session && this.timeEl) this.timeEl.setText(formatClock(session.elapsedMs));
    const job = this.plugin.jobs.find((j) => j.file.path === this.path);
    if (job && this.progressText) {
      this.progressText.setText(job.phase === "transcribing" ? `${job.message} ${job.progress}%` : job.message);
      if (this.progressFill) this.progressFill.style.width = `${job.phase === "transcribing" ? job.progress : 100}%`;
    }
  }
  pushLevel(mic, sys) {
    const level = Math.max(mic, sys);
    this.history.copyWithin(0, 1);
    this.history[WAVE_BARS - 1] = Math.min(1, level);
    const curve = (v) => `${Math.round(Math.min(1, Math.pow(Math.max(0, v), 0.5)) * 100)}%`;
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
  draw() {
    var _a;
    const c = this.canvas;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 140;
    const h = c.clientHeight || 32;
    if (c.width !== w * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = ((_a = this.plugin.session) == null ? void 0 : _a.phase) === "paused" ? "rgba(255,255,255,0.28)" : "#f24822";
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
  meter(parent, icon, label) {
    const m = parent.createDiv({ cls: "nrt-meter", attr: { "aria-label": label } });
    putIcon(m.createSpan({ cls: "nrt-meter-icon" }), icon);
    return m.createDiv({ cls: "nrt-track" }).createDiv({ cls: "nrt-fill" });
  }
  button(parent, icon, label, cls, onClick, text) {
    const b = parent.createEl("button", { cls: `nrt-btn ${cls}`.trim(), attr: { "aria-label": label } });
    putIcon(b.createSpan({ cls: "nrt-btn-icon" }), icon);
    if (text) b.createSpan({ text });
    b.addEventListener("click", (e) => {
      e.preventDefault();
      onClick(e);
    });
  }
  /** Dropdown to pick the summary template for the running recording. */
  showTemplateMenu(e) {
    const session = this.plugin.session;
    if (!session || session.file.path !== this.path) return;
    const current = session.activeTemplate.id;
    const menu = new import_obsidian5.Menu();
    menu.addItem((i) => i.setTitle("Summary template").setIsLabel(true));
    for (const t of allTemplates()) {
      menu.addItem((i) => i.setTitle(t.name).setChecked(t.id === current).onClick(() => {
        session.templateId = t.id;
      }));
    }
    menu.showAtMouseEvent(e);
  }
  destroy() {
    this.el.remove();
    if (!this.host.querySelector(".nrt-bar")) this.host.removeClass("nrt-host");
  }
};

// src/setup.ts
var import_obsidian6 = require("obsidian");
var fs6 = __toESM(require("fs"));
var SUGGESTED = [
  { name: "qwen3:4b", size: "~2.6 GB" },
  { name: "qwen3:8b", size: "~5.2 GB" }
];
var SetupModal = class extends import_obsidian6.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.rows = {};
    this.busy = /* @__PURE__ */ new Set();
    this.lastDraw = 0;
  }
  onOpen() {
    this.modalEl.addClass("nrt-setup");
    this.titleEl.setText("Note Recorder \u2014 setup");
    this.contentEl.createEl("p", { cls: "nrt-setup-intro", text: "Everything runs locally on your Mac. Nothing is uploaded." });
    this.listEl = this.contentEl.createDiv({ cls: "nrt-setup-list" });
    const footer = this.contentEl.createDiv({ cls: "nrt-setup-footer" });
    footer.createEl("button", { text: "Re-check" }).addEventListener("click", () => void this.check());
    footer.createEl("button", { text: "Done", cls: "mod-cta" }).addEventListener("click", () => this.close());
    void this.check();
  }
  async check() {
    const s = this.plugin.settings;
    if (!import_obsidian6.Platform.isMacOS) {
      this.rows.os = { status: "optional", title: "macOS", desc: "System-audio capture targets macOS. Microphone recording works everywhere." };
    }
    let micOk = false;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
      micOk = true;
    } catch (e) {
    }
    this.rows.mic = micOk ? { status: "ok", title: "Microphone access", desc: "Granted." } : {
      status: "missing",
      title: "Microphone access",
      desc: "Allow Obsidian in System Settings \u2192 Privacy & Security \u2192 Microphone, then restart Obsidian.",
      actions: [{ label: "Open privacy settings", run: () => void run("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"]) }]
    };
    const dir = this.plugin.pluginDir;
    if (!this.busy.has("native")) {
      const want = s.systemDeviceId === "native";
      if (!nativeSupported()) {
        this.rows.native = { status: "optional", title: "Built-in system audio", desc: "Requires macOS 13 Ventura or later \u2014 use BlackHole below." };
      } else if (helperBuilt(dir)) {
        this.rows.native = {
          status: want ? "ok" : "optional",
          title: "Built-in system audio",
          desc: "Ready. On first recording, allow Obsidian under Screen & System Audio Recording, then restart Obsidian.",
          actions: [{ label: "Permission settings", run: () => openScreenRecordingSettings() }]
        };
      } else if (await canBuildHelper()) {
        this.rows.native = {
          status: want ? "missing" : "optional",
          title: "Built-in system audio",
          desc: "Compiles a tiny local helper (one time, ~30 s) that captures your Mac's audio via ScreenCaptureKit.",
          actions: [{ label: "Prepare", cta: true, run: () => void this.buildNative() }]
        };
      } else {
        this.rows.native = {
          status: want ? "missing" : "optional",
          title: "Built-in system audio",
          desc: "Needs Apple's Command Line Tools (free). Install, then press Re-check.",
          actions: [{ label: "Install tools", cta: true, run: () => void run("/usr/bin/xcode-select", ["--install"]) }]
        };
      }
    }
    const inputs = await listAudioInputs().catch(() => []);
    const loop = inputs.find((d) => d.deviceId !== "default" && LOOPBACK_RE.test(d.label));
    this.rows.system = loop ? {
      status: s.systemDeviceId === "native" ? "optional" : "ok",
      title: "Loopback device \u2014 alternative",
      desc: `Found \u201C${loop.label}\u201D. Route output through a Multi-Output Device to use it.`,
      actions: [{ label: "Audio MIDI Setup", run: () => openApp("Audio MIDI Setup") }]
    } : {
      status: s.systemDeviceId === "native" || s.systemDeviceId === "none" ? "optional" : "missing",
      title: "BlackHole \u2014 alternative",
      desc: "Only needed if built-in capture isn't available.",
      actions: [{ label: "Install BlackHole", run: () => runInTerminal("brew install --cask blackhole-2ch && echo '\u2705 Done \u2014 restart Obsidian'") }]
    };
    const whisper = findWhisper(s.whisperPath);
    const brew = findBrew();
    const locate = { label: "Locate on this Mac\u2026", run: () => void this.locateWhisper() };
    if (!this.busy.has("whisper")) {
      this.rows.whisper = whisper ? { status: "ok", title: "Speech engine (whisper.cpp)", desc: whisper } : brew ? {
        status: "missing",
        title: "Speech engine (whisper.cpp)",
        desc: "Installs Homebrew's whisper-cpp (uses Apple Silicon GPU via Metal), or pick an existing whisper-cli binary.",
        actions: [{ label: "Install", cta: true, run: () => void this.installWhisper(brew) }, locate]
      } : {
        status: "missing",
        title: "Speech engine (whisper.cpp)",
        desc: "Already have whisper-cli somewhere? Locate it. Otherwise install Homebrew from brew.sh, then press Re-check.",
        actions: [locate, { label: "Open brew.sh", run: () => window.open("https://brew.sh") }]
      };
    }
    const model = getModel(s.whisperModel);
    if (!this.busy.has("model")) {
      this.rows.model = fs6.existsSync(modelPathFor(this.plugin.modelsDir, model.id)) ? { status: "ok", title: "Speech model", desc: model.label } : {
        status: "missing",
        title: "Speech model",
        desc: `${model.label} \u2014 ${model.size}. Change the model in settings.`,
        actions: [{ label: "Download", cta: true, run: () => void this.downloadModel() }]
      };
    }
    if (!this.busy.has("ollama")) this.rows.ollama = await this.ollamaRow();
    this.draw();
  }
  async ollamaRow() {
    const s = this.plugin.settings;
    const title = "Summaries (Ollama)";
    if (!s.summaryEnabled) return { status: "optional", title, desc: "Disabled in settings." };
    const models = await listOllamaModels(s.ollamaUrl);
    if (!models) {
      return {
        status: "optional",
        title: `${title} \u2014 optional`,
        desc: "Install and open Ollama to get a title, summary, key points and action items.",
        actions: [{ label: "Get Ollama", run: () => window.open("https://ollama.com/download") }]
      };
    }
    const names = models.map((m) => m.name);
    const current = matchInstalled(names, s.ollamaModel);
    const downloads = SUGGESTED.filter((m) => !matchInstalled(names, m.name)).map((m, i) => ({
      label: `Download ${m.name} (${m.size})`,
      cta: !models.length && i === 0,
      run: () => void this.pullOllama(m.name)
    }));
    if (!models.length) {
      return { status: "missing", title, desc: "Ollama is running but has no models yet. Download one:", actions: downloads };
    }
    return {
      status: current ? "ok" : "missing",
      title,
      desc: current ? `${models.length} model${models.length > 1 ? "s" : ""} installed. Choose which one writes your summaries.` : `\u201C${s.ollamaModel}\u201D is not installed. Choose one of your installed models:`,
      picker: {
        label: "Model",
        placeholder: current ? void 0 : "Choose a model\u2026",
        options: models.map((m) => ({ value: m.name, label: modelLabel(m) })),
        value: current != null ? current : "",
        onChange: async (v) => {
          s.ollamaModel = v;
          await this.plugin.saveSettings();
          this.rows.ollama = await this.ollamaRow();
          this.draw();
        }
      },
      actions: downloads
    };
  }
  async buildNative() {
    this.busy.add("native");
    const row = { status: "working", title: "Built-in system audio", desc: "Compiling helper\u2026", progress: null, log: "" };
    this.rows.native = row;
    this.draw();
    try {
      await buildHelper(this.plugin.pluginDir, (l) => {
        row.log = l;
        this.draw();
      });
    } catch (e) {
      row.log = e.message;
    }
    this.busy.delete("native");
    await this.check();
  }
  async locateWhisper() {
    const p = await pickFile();
    if (!p) return;
    this.plugin.settings.whisperPath = p;
    await this.plugin.saveSettings();
    await this.check();
  }
  async installWhisper(brew) {
    this.busy.add("whisper");
    const row = { status: "working", title: "Speech engine (whisper.cpp)", desc: "Installing with Homebrew\u2026", progress: null, log: "" };
    this.rows.whisper = row;
    this.draw();
    const code = await run(brew, ["install", "whisper-cpp"], (l) => {
      row.log = l;
      this.draw();
    }).catch(() => 1);
    this.busy.delete("whisper");
    if (code !== 0) row.desc = "Install failed \u2014 run `brew install whisper-cpp` in Terminal.";
    await this.check();
  }
  async downloadModel() {
    const model = getModel(this.plugin.settings.whisperModel);
    this.busy.add("model");
    const row = { status: "working", title: "Speech model", desc: `Downloading ${model.label}\u2026`, progress: 0 };
    this.rows.model = row;
    this.draw();
    try {
      await downloadFile(modelUrl(model), modelPathFor(this.plugin.modelsDir, model.id), (got, total) => {
        row.progress = total ? got / total : null;
        row.log = total ? `${formatBytes(got)} / ${formatBytes(total)}` : formatBytes(got);
        this.drawThrottled();
      });
    } catch (e) {
      row.log = `Failed: ${e.message}`;
    }
    this.busy.delete("model");
    await this.check();
  }
  async pullOllama(name) {
    this.busy.add("ollama");
    const row = { status: "working", title: "Summaries (Ollama)", desc: `Downloading ${name}\u2026`, progress: null };
    this.rows.ollama = row;
    this.draw();
    try {
      await postNdjson(`${this.plugin.settings.ollamaUrl.replace(/\/$/, "")}/api/pull`, { model: name, stream: true }, (o) => {
        var _a;
        if (o.total && o.completed) row.progress = o.completed / o.total;
        row.log = (_a = o.status) != null ? _a : "";
        this.drawThrottled();
      });
      this.plugin.settings.ollamaModel = name;
      await this.plugin.saveSettings();
    } catch (e) {
      row.log = `Failed: ${e.message}`;
    }
    this.busy.delete("ollama");
    await this.check();
  }
  drawThrottled() {
    const now = Date.now();
    if (now - this.lastDraw > 150) {
      this.lastDraw = now;
      this.draw();
    }
  }
  draw() {
    var _a, _b;
    const scroller = this.contentEl;
    const top = scroller.scrollTop;
    this.listEl.style.minHeight = `${this.listEl.offsetHeight}px`;
    this.listEl.empty();
    for (const row of Object.values(this.rows)) {
      const r = this.listEl.createDiv({ cls: `nrt-setup-row is-${row.status}` });
      const icon = r.createDiv({ cls: "nrt-setup-icon" });
      if (row.status === "working") icon.createSpan({ cls: "nrt-spinner" });
      else (0, import_obsidian6.setIcon)(icon, row.status === "ok" ? "check-circle-2" : row.status === "missing" ? "circle-dashed" : "minus-circle");
      const body = r.createDiv({ cls: "nrt-setup-body" });
      body.createDiv({ cls: "nrt-setup-title", text: row.title });
      body.createDiv({ cls: "nrt-setup-desc", text: row.desc });
      if (row.picker) {
        const p = row.picker;
        const wrap2 = body.createDiv({ cls: "nrt-setup-picker" });
        wrap2.createSpan({ cls: "nrt-setup-picker-label", text: p.label });
        const sel = wrap2.createEl("select", { cls: "dropdown" });
        if (p.placeholder) {
          const o = sel.createEl("option", { text: p.placeholder });
          o.value = "";
          o.disabled = true;
        }
        for (const opt2 of p.options) {
          const o = sel.createEl("option", { text: opt2.label });
          o.value = opt2.value;
        }
        sel.value = p.value;
        sel.addEventListener("change", () => sel.value && p.onChange(sel.value));
      }
      if (row.status === "working") {
        const track = body.createDiv({ cls: "nrt-track" + (row.progress == null ? " nrt-indeterminate" : "") });
        track.createDiv({ cls: "nrt-fill" }).style.width = `${Math.round(((_a = row.progress) != null ? _a : 1) * 100)}%`;
      }
      if (row.log) body.createDiv({ cls: "nrt-setup-log", text: row.log });
      if ((_b = row.actions) == null ? void 0 : _b.length) {
        const a = r.createDiv({ cls: "nrt-setup-actions" });
        row.actions.forEach((act) => a.createEl("button", { text: act.label, cls: act.cta ? "mod-cta" : "" }).addEventListener("click", act.run));
      }
    }
    this.listEl.style.minHeight = "";
    scroller.scrollTop = top;
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var NoteRecorderPlugin = class extends import_obsidian7.Plugin {
  constructor() {
    super(...arguments);
    this.session = null;
    this.jobs = [];
    this.caffeinate = null;
  }
  /** Absolute path of this plugin's folder. */
  get pluginDir() {
    var _a;
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof import_obsidian7.FileSystemAdapter)) throw new Error("Desktop vault required");
    return path5.join(adapter.getBasePath(), (_a = this.manifest.dir) != null ? _a : `${this.app.vault.configDir}/plugins/${this.manifest.id}`);
  }
  get modelsDir() {
    return path5.join(this.pluginDir, "models");
  }
  async onload() {
    await this.loadSettings();
    const ribbon = this.addRibbonIcon("mic", "Start recording in current note", () => this.toggleRecording());
    ribbon.addClass("nrt-ribbon");
    this.ui = new NoteUI(this, ribbon, this.addStatusBarItem());
    this.addSettingTab(new RecorderSettingTab(this.app, this));
    this.addCommand({ id: "toggle-recording", name: "Start / stop recording in current note", callback: () => this.toggleRecording() });
    this.addCommand({
      id: "record-with-template",
      name: "Record with template\u2026",
      checkCallback: (checking) => {
        var _a;
        if (this.session || !((_a = this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView)) == null ? void 0 : _a.file)) return false;
        if (!checking) new TemplateModal(this.app, (t) => void this.startRecording(void 0, t.id)).open();
        return true;
      }
    });
    this.addCommand({
      id: "pause-recording",
      name: "Pause / resume recording",
      checkCallback: (checking) => {
        if (!this.session || this.session.phase === "starting" || this.session.phase === "stopping") return false;
        if (!checking) this.togglePause();
        return true;
      }
    });
    this.addCommand({
      id: "discard-recording",
      name: "Discard current recording",
      checkCallback: (checking) => {
        if (!this.session) return false;
        if (!checking) void this.cancelRecording();
        return true;
      }
    });
    this.addCommand({ id: "open-setup", name: "Open setup assistant", callback: () => this.openSetup() });
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
  onunload() {
    var _a;
    if (this.session) void this.session.cancel();
    this.session = null;
    (_a = this.ui) == null ? void 0 : _a.destroy();
    this.setKeepAwake(false);
  }
  /* ---------------- recording control ---------------- */
  toggleRecording(view) {
    if (this.session) {
      if (this.session.phase === "recording" || this.session.phase === "paused") void this.stopRecording();
      return;
    }
    void this.startRecording(view);
  }
  async startRecording(view, templateId) {
    var _a;
    const target = view != null ? view : this.app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
    if (!(target == null ? void 0 : target.file)) {
      new import_obsidian7.Notice("Open a note first \u2014 the recording is added to it.");
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
      const err = e;
      const msg = (err == null ? void 0 : err.name) === "NotAllowedError" ? "Microphone access denied. Allow Obsidian in System Settings \u2192 Privacy & Security \u2192 Microphone." : `Could not start recording: ${(_a = err == null ? void 0 : err.message) != null ? _a : e}`;
      new import_obsidian7.Notice(msg, 8e3);
    }
    this.ui.refresh();
  }
  togglePause() {
    const s = this.session;
    if (!s) return;
    if (s.phase === "recording") s.pause();
    else if (s.phase === "paused") s.resume();
    this.ui.refresh();
  }
  async stopRecording() {
    const s = this.session;
    if (!s || s.phase !== "recording" && s.phase !== "paused") return;
    try {
      const pending = s.stop();
      this.ui.refresh();
      const job = await pending;
      this.session = null;
      this.jobs.push(job);
      this.ui.refresh();
      void job.run();
    } catch (e) {
      this.session = null;
      new import_obsidian7.Notice(`Recording failed: ${e.message}`, 8e3);
      this.ui.refresh();
      this.updateKeepAwake();
    }
  }
  async cancelRecording() {
    const s = this.session;
    if (!s) return;
    await s.cancel();
    this.session = null;
    new import_obsidian7.Notice("Recording discarded.");
    this.ui.refresh();
    this.updateKeepAwake();
  }
  onJobFinished(job) {
    this.ui.refresh();
    this.updateKeepAwake();
    window.setTimeout(() => {
      this.jobs = this.jobs.filter((j) => j !== job);
      this.ui.refresh();
    }, job.phase === "error" ? 8e3 : 3500);
  }
  openSetup() {
    new SetupModal(this.app, this).open();
  }
  /* ---------------- keep awake ---------------- */
  updateKeepAwake() {
    const busy = !!this.session || this.jobs.some((j) => j.phase !== "done" && j.phase !== "error");
    this.setKeepAwake(busy);
  }
  setKeepAwake(on) {
    if (on && this.settings.keepAwake && !this.caffeinate) this.caffeinate = startCaffeinate();
    if (!on && this.caffeinate) {
      this.caffeinate.kill();
      this.caffeinate = null;
    }
  }
  /* ---------------- settings ---------------- */
  async loadSettings() {
    var _a, _b;
    const data = (_a = await this.loadData()) != null ? _a : {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    setCustomTemplates(this.settings.customTemplates);
    if (((_b = data.settingsVersion) != null ? _b : 1) < 2) {
      if (this.settings.systemDeviceId === "auto") this.settings.systemDeviceId = "native";
      this.settings.settingsVersion = 2;
      await this.saveSettings();
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
