// Where a project keeps its threads: the folder the plugin's "folder" setting names
// (core/settings.json), else the one the nearest .omp/threads.json names, as
// `{"folder": "<path>"}`, from the project's folder up. Nothing is guessed: without either, a
// project has no threads list. A relative path is relative to where it was written: the person's
// settings file to the home folder, the project's file and an agent's own screen to the project,
// .omp/threads.json to the folder holding .omp/. The folder may lie outside the project (a sibling
// notes repository, an absolute path): a project's settings are trusted as much as its code.
import type { Io, Place } from "../kit/core/io";
import type { ModelText } from "../kit/core/model";
import { readSettings } from "../kit/core/settings";
import { model } from "./model.gen";
import { declared } from "./settings.gen";

export const PLUGIN = "piebird-threads";

/** A project's threads folder: its absolute path, and its name as the project gives it. */
export interface ThreadsFolder {
	readonly path: string;
	readonly name: string;
}

/** A failure the model is told about, in the catalog's words. */
export class ThreadsError extends Error {
	constructor(readonly said: ModelText) {
		super(said.text);
	}
}

function isAbsolute(path: string): boolean {
	return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

/** A Windows network share's root, `\\server\share` (either separator), written `//server/share`. */
const SHARE = /^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)/;

/**
 * A path's root and the parts after it: the root is empty for `/`, a drive (`C:`), or a network
 * share (`//server/share`), which `..` never leaves.
 */
function rooted(whole: string): { root: string; parts: string[] } {
	const share = SHARE.exec(whole);
	if (share) return { root: `//${share[1]}/${share[2]}`, parts: whole.slice(share[0].length).split(/[\\/]/) };
	const [root = "", ...parts] = whole.split(/[\\/]/);
	return { root, parts };
}

/** `path` taken from `base` when relative, its `.` and `..` resolved; separators become `/`. */
export function resolvePath(base: string, path: string): string {
	const { root, parts } = rooted(isAbsolute(path) ? path : `${base}/${path}`);
	const kept: string[] = [];
	for (const part of parts) {
		if (part === "" || part === ".") continue;
		if (part === "..") kept.pop();
		else kept.push(part);
	}
	return `${root}/${kept.join("/")}`;
}

/** The folder holding `dir`, or `dir` itself at the root (`/`, a drive's or a network share's). */
function parentOf(dir: string): string {
	const share = SHARE.exec(dir);
	if (share && /^[\\/]*$/.test(dir.slice(share[0].length))) return dir;
	const at = Math.max(dir.lastIndexOf("/"), dir.lastIndexOf("\\"));
	if (at < 0) return dir;
	return at === 0 ? "/" : dir.slice(0, at);
}

/** A folder as the project wrote it, without trailing separators. */
function trimmed(name: string): string {
	return name.trim().replace(/[\\/]+$/, "");
}

/** The folder the nearest .omp/threads.json names from `dir` up; one that names none throws. */
async function fromOmpFile(io: Io, dir: string): Promise<ThreadsFolder | undefined> {
	for (let at = dir; ; at = parentOf(at)) {
		const config = resolvePath(at, ".omp/threads.json");
		const text = await io.readText(config);
		if (text !== undefined) {
			const parsed: unknown = JSON.parse(text);
			const folder = typeof parsed === "object" && parsed !== null && "folder" in parsed ? parsed.folder : undefined;
			if (typeof folder !== "string" || trimmed(folder) === "")
				throw new ThreadsError(model.text("reason-no-folder", { config }));
			return { path: resolvePath(at, trimmed(folder)), name: trimmed(folder) };
		}
		if (parentOf(at) === at) return undefined;
	}
}

/** The project's threads folder at `place`, given the agent's own choice, or undefined when none is named. */
export async function threadsFolder(io: Io, place: Place, choice: unknown): Promise<ThreadsFolder | undefined> {
	const agent = typeof choice === "string" ? { folder: choice } : {};
	const { values } = await readSettings(io, place, { plugin: PLUGIN, declared, agent });
	const setting = values.folder;
	if (setting === undefined || trimmed(setting.value) === "") return fromOmpFile(io, place.project);
	const base = setting.from === "user" ? place.home : place.project;
	const name = trimmed(setting.value);
	return { path: resolvePath(base, name), name };
}
