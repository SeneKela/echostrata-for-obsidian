import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import * as path from "path";

/** GUI apps on macOS don't inherit the shell PATH, so Homebrew locations are added explicitly. */
const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin", "/bin", "/usr/sbin"];

export function shellEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	env.PATH = [...EXTRA_PATH, env.PATH || ""].join(":");
	env.HOMEBREW_NO_AUTO_UPDATE = "1";
	env.HOMEBREW_NO_INSTALL_CLEANUP = "1";
	return env;
}

export function findExecutable(names: string[], override?: string): string | null {
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

export const findWhisper = (override?: string) => findExecutable(["whisper-cli", "whisper-cpp"], override);
export const findBrew = () => findExecutable(["brew"]);

export function makeWorkDir(id: string): string {
	const dir = path.join(os.tmpdir(), "obsidian-note-recorder", id);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

export function removeDir(dir: string): void {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

/** Runs a command, streaming combined output lines to `onLine`. Resolves with the exit code. */
export function run(
	cmd: string,
	args: string[],
	onLine?: (line: string) => void,
	signal?: AbortSignal,
): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { env: shellEnv() });
		const feed = (buf: Buffer) => buf.toString().split(/\r?\n|\r/).forEach((l) => l.trim() && onLine?.(l));
		child.stdout.on("data", feed);
		child.stderr.on("data", feed);
		child.on("error", reject);
		child.on("close", (code) => resolve(code ?? 1));
		signal?.addEventListener("abort", () => child.kill("SIGTERM"));
	});
}

/** Opens Terminal.app with a command (for installs that need a sudo password, e.g. BlackHole). */
export function runInTerminal(command: string): void {
	const escaped = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	spawn("osascript", ["-e", `tell application "Terminal" to activate`, "-e", `tell application "Terminal" to do script "${escaped}"`], {
		env: shellEnv(),
		detached: true,
	});
}

export function openApp(name: string): void {
	spawn("open", ["-a", name], { env: shellEnv(), detached: true });
}

/** Prevents idle sleep while recording / transcribing (macOS `caffeinate`). */
export function startCaffeinate(): ChildProcess | null {
	try {
		return spawn("/usr/bin/caffeinate", ["-i", "-m"], { env: shellEnv() });
	} catch {
		return null;
	}
}

/** Streaming download with redirect support and progress; writes to `<dest>.part` then renames. */
export function downloadFile(
	url: string,
	dest: string,
	onProgress: (received: number, total: number) => void,
	signal?: AbortSignal,
	redirects = 0,
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (redirects > 10) return reject(new Error("Too many redirects"));
		const mod = url.startsWith("https:") ? https : http;
		const req = mod.get(url, { headers: { "User-Agent": "obsidian-note-recorder" } }, (res) => {
			const status = res.statusCode ?? 0;
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
			res.on("data", (c: Buffer) => {
				received += c.length;
				onProgress(received, total);
			});
			res.pipe(file);
			file.on("finish", () => file.close(() => {
				fs.renameSync(part, dest);
				resolve();
			}));
			const fail = (e: Error) => {
				file.destroy();
				fs.rmSync(part, { force: true });
				reject(e);
			};
			res.on("error", fail);
			file.on("error", fail);
			signal?.addEventListener("abort", () => {
				req.destroy();
				fail(new Error("Cancelled"));
			});
		});
		req.on("error", reject);
	});
}

/** POSTs JSON and invokes `onJson` for each newline-delimited JSON object in the response (Ollama streaming). */
export function postNdjson(url: string, body: unknown, onJson: (obj: any) => void): Promise<void> {
	return new Promise((resolve, reject) => {
		const u = new URL(url);
		const mod = u.protocol === "https:" ? https : http;
		const data = JSON.stringify(body);
		const req = mod.request(
			u,
			{ method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
			(res) => {
				let buf = "";
				res.on("data", (c: Buffer) => {
					buf += c.toString();
					let i: number;
					while ((i = buf.indexOf("\n")) >= 0) {
						const line = buf.slice(0, i).trim();
						buf = buf.slice(i + 1);
						if (line) {
							try {
								onJson(JSON.parse(line));
							} catch {
								/* partial line */
							}
						}
					}
				});
				res.on("end", () => (res.statusCode && res.statusCode >= 400 ? reject(new Error(`HTTP ${res.statusCode}`)) : resolve()));
				res.on("error", reject);
			},
		);
		req.on("error", reject);
		req.write(data);
		req.end();
	});
}

export function formatBytes(n: number): string {
	if (n > 1e9) return (n / 1e9).toFixed(2) + " GB";
	if (n > 1e6) return (n / 1e6).toFixed(0) + " MB";
	return (n / 1e3).toFixed(0) + " KB";
}
