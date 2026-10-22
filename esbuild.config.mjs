import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
const prod = process.argv[2] === "production";
const builtins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
const ctx = await esbuild.context({
	entryPoints: ["src/main.ts"], bundle: true,
	external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
	format: "cjs", target: "es2018", logLevel: "info", sourcemap: prod ? false : "inline",
	treeShaking: true, minify: false, // Resampler source is injected into the AudioWorklet via toString()
	outfile: "main.js",
});
if (prod) { await ctx.rebuild(); process.exit(0); } else { await ctx.watch(); }
