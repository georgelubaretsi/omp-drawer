// Where a project keeps its threads: the folder it names in `.omp/threads.json`, as
// `{"folder": "<path>"}`, relative to the folder holding `.omp/`. The nearest such file from the
// session's working folder up wins; a project without one gets no threads list. Nothing is guessed.
// The folder may lie outside the project (a sibling notes repository, an absolute path): a
// project's `.omp/` is trusted as much as the extensions omp loads from it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { templates } from "./templates";

/** The file a project names its threads folder in, relative to the project's root. */
export const CONFIG = join(".omp", "threads.json");

/** A project's threads folder: its absolute path, and its name as the project gives it. */
export interface ThreadsFolder {
	path: string;
	name: string;
}

// The folder a config file names; a file that names none throws.
function namedFolder(config: string): string {
	const parsed: unknown = JSON.parse(readFileSync(config, "utf8"));
	const folder = typeof parsed === "object" && parsed !== null && "folder" in parsed ? parsed.folder : undefined;
	if (typeof folder !== "string" || folder.trim() === "")
		throw new Error(templates.list.text("reasons.noFolder", { config }));
	return folder.trim().replace(/\/+$/, "");
}

/** The threads folder the nearest `.omp/threads.json` names, or undefined when there is none. */
export function findThreadsFolder(cwd: string): ThreadsFolder | undefined {
	for (let dir = cwd; ; dir = dirname(dir)) {
		const config = join(dir, CONFIG);
		if (existsSync(config)) {
			const name = namedFolder(config);
			return { path: resolve(dir, name), name };
		}
		if (dirname(dir) === dir) return undefined;
	}
}
