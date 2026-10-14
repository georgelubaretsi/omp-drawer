// Files people keep their own settings in, read and replaced so that nothing of theirs is lost:
// one that can't be read is never taken for empty, and a replaced one keeps its permissions.
// The build copies kit/ into each plugin that needs it (plugins/<name>/kit/); edit it in kit/.
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The file's text; undefined when there is no file. One that's there but can't be read (no
 * permission, an I/O error) throws, so it's never replaced as if it were empty.
 */
export function readIfThere(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		const code = error instanceof Error && "code" in error ? error.code : undefined;
		if (code === "ENOENT" || code === "ENOTDIR") return undefined;
		const why = error instanceof Error ? error.message : "it couldn't be read";
		throw new Error(`${path} couldn't be read, so it was left as it is (${why})`, { cause: error });
	}
}

/**
 * Replaces the file's text in one step, a file beside it renamed over it, keeping its permissions:
 * a file only its owner may read stays that way. A new file gets the usual ones. The file beside
 * it has a name of its own and is made afresh, so no file left from before can show the text.
 */
export function replaceFile(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	const mode = statSync(path, { throwIfNoEntry: false })?.mode;
	const tmp = `${path}.${randomUUID()}.tmp`;
	try {
		// Created no more open than the file, then given exactly its permissions.
		writeFileSync(tmp, text, { flag: "wx", mode: mode === undefined ? 0o666 : mode & 0o777 });
		if (mode !== undefined) chmodSync(tmp, mode & 0o777);
		renameSync(tmp, path);
	} catch (error) {
		rmSync(tmp, { force: true });
		throw error;
	}
}
