// The files the installer writes: folders replaced whole, so a failure halfway leaves the old
// folder in place, and the people's own files (Codex's config.toml, Claude's settings.json, the
// personal marketplace) replaced in one step after an edit, keeping their permissions
// (kit/program/files.ts).
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PayloadFile } from "../core/payload";
import { readIfThere, replaceFile } from "../../kit/program/files";

/** Writes `files` as the whole of `dir`: built beside it, then swapped in. */
export function replaceFolder(dir: string, files: readonly PayloadFile[]): void {
	const next = `${dir}.new-${process.pid}`;
	const old = `${dir}.old-${process.pid}`;
	rmSync(next, { recursive: true, force: true });
	for (const f of files) {
		const path = join(next, f.path);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, f.data);
		chmodSync(path, f.mode);
	}
	mkdirSync(dirname(dir), { recursive: true });
	const had = existsSync(dir);
	if (had) renameSync(dir, old);
	try {
		renameSync(next, dir);
	} catch (error) {
		// The new folder couldn't take its place (a scanner holding it open, say): the old one goes back.
		if (had) renameSync(old, dir);
		rmSync(next, { recursive: true, force: true });
		throw error;
	}
	rmSync(old, { recursive: true, force: true });
}

/** The files under `prefix/` in the payload, with `prefix/` taken off their paths. */
export function under(files: readonly PayloadFile[], prefix: string): PayloadFile[] {
	return files
		.filter(f => f.path.startsWith(`${prefix}/`))
		.map(f => ({ ...f, path: f.path.slice(prefix.length + 1) }));
}

/** The file's JSON; undefined when there is no file. A file that isn't JSON throws, so it's never overwritten. */
export function readJson(path: string): unknown {
	const text = readIfThere(path);
	if (text === undefined || text.trim() === "") return undefined;
	try {
		const value: unknown = JSON.parse(text);
		return value;
	} catch {
		throw new Error(`${path} isn't JSON; it was left as it is`);
	}
}

export function writeJson(path: string, value: unknown): void {
	replaceFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
