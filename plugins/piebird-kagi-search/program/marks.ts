// Which Codex sessions a Kagi call failed in. Codex runs the MCP server and each hook as separate
// processes, so the server leaves a mark, a file per session, for the web.run hook to read. A mark
// lasts a week. Codex sends its session id with each call; a call without one leaves a mark that
// counts for every session for ten minutes, so an agent that stops sending it gets a mark that ends
// rather than none.
import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

const WEEK = 7 * 24 * 60 * 60 * 1000;
const UNNAMED_FOR = 10 * 60 * 1000;
const UNNAMED = "any";

export interface Marks {
	/** Marks `session`, or every session for a while when there is none; drops marks past a week. */
	set(session: string | undefined): Promise<void>;
	/** Whether `session` is marked, by its own mark or a recent one without a session. */
	has(session: string): Promise<boolean>;
}

/** The person's cache folder, where marks are kept: the system's place for it. */
export function cacheFolder(home: string, env: Readonly<Record<string, string | undefined>>, platform: string): string {
	if (platform === "darwin") return join(home, "Library", "Caches");
	if (platform === "win32") return env.LOCALAPPDATA ?? join(home, "AppData", "Local");
	return env.XDG_CACHE_HOME || join(home, ".cache");
}

/** A session's mark file: a hash, so any id makes a plain file name. */
function fileOf(dir: string, session: string | undefined): string {
	if (session === undefined || session === "") return join(dir, UNNAMED);
	return join(dir, createHash("sha256").update(session).digest("hex").slice(0, 16));
}

/** The marks kept in `dir`; `now` is the clock, for a test. */
export function failureMarks(dir: string, now: () => number = Date.now): Marks {
	const age = async (file: string) => {
		const info = await stat(file).catch(() => undefined);
		return info === undefined ? Infinity : now() - info.mtimeMs;
	};
	const prune = async () => {
		for (const name of await readdir(dir).catch((): string[] => []))
			if ((await age(join(dir, name))) >= WEEK) await rm(join(dir, name), { force: true });
	};
	return {
		async set(session) {
			await prune();
			await mkdir(dir, { recursive: true, mode: 0o700 });
			const file = fileOf(dir, session);
			await writeFile(file, "", { mode: 0o600 });
			const when = new Date(now());
			await utimes(file, when, when);
		},
		async has(session) {
			return (await age(fileOf(dir, session))) < WEEK || (await age(fileOf(dir, undefined))) < UNNAMED_FOR;
		},
	};
}
