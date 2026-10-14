// The program's Place; its Io is the Bun shells' (kit/bun/io.ts). The program runs either from
// source (`bun run <plugin>/program/main.ts`, this file at <plugin>/kit/program/io.ts) or
// compiled into <plugin>/native/; the plugin's folder is found from where it runs.
import type { Place } from "../core/io";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** Whether this runs compiled: Bun puts a compiled program's own files under a virtual root. */
const COMPILED = /^(\/\$bunfs\/|[A-Z]:\\~BUN\\)/;

/**
 * The plugin a compiled program belongs to: <plugin>/native/<program>.exe on Windows,
 * <plugin>/native/<platform>/<program> elsewhere (docs/manifests.md, "Native programs").
 */
function pluginOf(executable: string): string {
	const folder = dirname(executable);
	return basename(folder) === "native" ? dirname(folder) : dirname(dirname(folder));
}

/** Home, the project (the folder the agent started the program in) and the plugin's folder. */
export function programPlace(): Place {
	const plugin = COMPILED.test(import.meta.dir) ? pluginOf(process.execPath) : join(import.meta.dir, "..", "..");
	return { home: homedir(), project: process.cwd(), plugin };
}
