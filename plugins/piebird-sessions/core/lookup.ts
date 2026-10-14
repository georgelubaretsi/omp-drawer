// Where each agent keeps its journals, a session's id from a journal's name, and the one journal
// a session argument names.
import type { Io } from "../kit/core/io";
import { joinText, type ModelText } from "../kit/core/model";
import { headLines, type Opener } from "./formats/journal";
import { asString } from "./json";
import { model } from "./model.gen";
import { joinItems, ReadError, shownPath } from "./text";

/** The folders each agent keeps its journals in, from the environment the shell reads. */
export interface Roots {
	omp: string;
	claude: string;
	codex: string;
}

export function rootsOf(home: string, env: { CLAUDE_CONFIG_DIR?: string; CODEX_HOME?: string }): Roots {
	return {
		omp: `${home}/.omp/agent/sessions`,
		claude: `${env.CLAUDE_CONFIG_DIR || `${home}/.claude`}/projects`,
		codex: `${env.CODEX_HOME || `${home}/.codex`}/sessions`,
	};
}

/** Claude Code cuts a project's folder name at this length and ends it with a hash of the path. */
const CLAUDE_NAME_LIMIT = 200;

/** The folder under `projects` where Claude Code keeps the journals of sessions started in `cwd`. */
export async function claudeProjectFolder(io: Io, projects: string, cwd: string): Promise<string> {
	const name = cwd.replace(/[^a-zA-Z0-9]/g, "-");
	if (name.length <= CLAUDE_NAME_LIMIT) return `${projects}/${name}`;
	// The hash is Claude Code's own, so a long one is found by the name's start.
	const start = name.slice(0, CLAUDE_NAME_LIMIT);
	const found = ((await io.list(projects)) ?? []).find(e => e.directory && e.name.startsWith(`${start}-`));
	return `${projects}/${found?.name ?? start}`;
}

/** Characters read at most from a journal's start for its title and first prompt. */
export const HEAD = 512 * 1024;

/** Opens a journal found earlier for each pass over it. */
export function openerOf(io: Io, file: string): Opener {
	return async () => {
		const pieces = await io.readPieces(file);
		if (pieces === undefined) throw new Error(`${file} was removed while it was read`);
		return pieces;
	};
}

/**
 * The session id in a journal's name: omp's `<time>_<id>.jsonl`, Codex's
 * `rollout-<time>-<id>.jsonl`, Claude Code's `<id>.jsonl` (not a copy it set aside).
 */
export function sessionIdOf(name: string): string | undefined {
	if (!name.endsWith(".jsonl") || name.includes(".orphaned-")) return undefined;
	const codex = /^rollout-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-(.+)\.jsonl$/.exec(name);
	if (codex) return codex[1];
	const omp = /^[^_]+_(.+)\.jsonl$/.exec(name);
	return omp ? omp[1] : name.slice(0, -".jsonl".length);
}

/** The journals under `roots` whose session id starts with `id`, sorted. */
export async function findSessionFiles(io: Io, id: string, roots: readonly string[]): Promise<string[]> {
	const matches = new Set<string>();
	const stack = [...roots];
	for (let dir = stack.pop(); dir !== undefined; dir = stack.pop()) {
		for (const entry of (await io.list(dir)) ?? []) {
			const path = `${dir}/${entry.name}`;
			if (entry.directory) stack.push(path);
			else if (sessionIdOf(entry.name)?.startsWith(id)) matches.add(path);
		}
	}
	return [...matches].toSorted();
}

/** A session's title, the one the agent gave it, when the journal's start holds it. */
export async function sessionTitle(open: Opener): Promise<string | undefined> {
	for await (const { entries } of headLines(open, HEAD)) {
		for (const entry of entries) {
			const title = entry.type === "title" || entry.type === "session" ? asString(entry.title) : undefined;
			if (title) return title;
		}
	}
	return undefined;
}

/** At most this many sessions, and their titles, are read and listed when an id prefix names several. */
export const AMBIGUOUS_LIMIT = 10;

async function ambiguous(io: Io, session: string, files: string[]): Promise<ReadError> {
	const listed = files.slice(0, AMBIGUOUS_LIMIT);
	const lines: ModelText[] = [
		model.text("error-ambiguous", {
			session,
			total: files.length,
			shown: listed.length,
			more: files.length > listed.length ? "yes" : "no",
		}),
	];
	for (const file of listed) {
		const title = await sessionTitle(openerOf(io, file));
		lines.push(title ? model.text("ambiguous-file-titled", { file, title }) : model.text("ambiguous-file", { file }));
	}
	return new ReadError("ambiguous", joinText(lines));
}

/**
 * The one journal a session id, id prefix or `.jsonl` path names. A path may start with `~`, as
 * the self line shows a journal under `home`.
 */
export async function resolveSession(
	io: Io,
	session: string,
	at: { roots: readonly string[]; home: string },
): Promise<string> {
	const given = /^~(?=$|[\\/])/.test(session) ? `${at.home}${session.slice(1)}` : session;
	if (given.endsWith(".jsonl") && (await io.readPieces(given)) !== undefined) return given;
	const files = await findSessionFiles(io, session, at.roots);
	const [only] = files;
	if (only === undefined) {
		const roots =
			joinItems(
				at.roots.map(root => shownPath(root, at.home)),
				"join-or",
			)?.text ?? "";
		throw new ReadError("not-found", model.text("error-not-found", { session, roots }));
	}
	if (files.length > 1) throw await ambiguous(io, session, files);
	return only;
}
