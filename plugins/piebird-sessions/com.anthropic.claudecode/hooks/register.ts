// piebird-sessions's Claude Code part, a mod: the session_read tool, and a block in the
// conversation's context that names this session and its journal, for the agent to read or cite.
// Claude Code keeps a session's journal as <id>.jsonl in its project's folder under projects/.
import type { Api, Register } from "claude-code";
import type { Io, Place } from "../../kit/core/io";
import { contextBlock } from "../../kit/claude/context";
import { FS_READ_LIMIT, printerOf, stdoutPieces } from "../../kit/claude/pieces";
import { dispatch, toolArguments, toolNames, toolSpecs } from "../../kit/claude/tools";
import { claudeProjectFolder, type Roots, rootsOf } from "../../core/lookup";
import { operations } from "../../core/operations.gen";
import { readHandler } from "../../core/read";
import { selfLine } from "../../core/self";

const PLUGIN = "piebird-sessions";

/** Core's file reads, folder listings and program runs, made of this session's `$`. */
function ioOf($: Api): Io {
	return {
		async readText(path) {
			try {
				return await $.fs.read(path);
			} catch (error) {
				// $.fs.read rejects a missing file as it does any other failure ("… failed: ENOENT").
				if (!(await $.fs.exists(path))) return undefined;
				throw error;
			}
		},
		async readPieces(path) {
			if (!(await $.fs.exists(path))) return undefined;
			// Nothing is read or spawned until the first piece is asked for.
			return (async function* () {
				if ((await $.fs.stat(path)).size < FS_READ_LIMIT) {
					yield await $.fs.read(path);
					return;
				}
				const printer = printerOf(path, (await $.env.get("OS")) === "Windows_NT");
				yield* stdoutPieces($.process.spawn(printer), printer);
			})();
		},
		async list(path) {
			try {
				return (await $.fs.list(path)).map(entry => ({
					name: entry.name,
					directory: entry.kind === "dir",
					modified: entry.kind === "file" ? entry.mtimeMs : 0,
				}));
			} catch (error) {
				if (!(await $.fs.exists(path))) return undefined;
				throw error;
			}
		},
		// Rejects when the program can't start or outlives timeoutMs (default 30 s, at most 10 min).
		run: (argv, options) => $.process.run(argv, { ...options }),
	};
}

/** The person's home, the session's project root (it follows /cd), and the plugin's folder. */
async function placeOf($: Api): Promise<Place> {
	const home = (await $.env.get("HOME")) ?? (await $.env.get("USERPROFILE"));
	if (home === undefined) throw new Error("neither HOME nor USERPROFILE is set");
	return { home, project: await $.session.root(), plugin: $.plugin.root };
}

/** Where every agent keeps its journals, and this session's journal with the folder it's in. */
async function sessionOf(
	$: Api,
	io: Io,
	home: string,
): Promise<{ roots: Roots; folder: string; id: string; file: string }> {
	const env = { CLAUDE_CONFIG_DIR: await $.env.get("CLAUDE_CONFIG_DIR"), CODEX_HOME: await $.env.get("CODEX_HOME") };
	const roots = rootsOf(home, env);
	const folder = await claudeProjectFolder(io, roots.claude, await $.session.cwd());
	const id = await $.session.id();
	return { roots, folder, id, file: `${folder}/${id}.jsonl` };
}

export const register: Register = on => {
	on("session.start", async ($, e, next) => {
		for (const spec of toolSpecs(operations)) await $.tool.register(spec);
		return next(e);
	});
	on("prompt.context", async ($, e, next) => {
		const r = await next(e);
		const { home } = await placeOf($);
		const at = await sessionOf($, ioOf($), home);
		return { ...r, blocks: [...r.blocks, contextBlock(PLUGIN, selfLine({ id: at.id, file: at.file }, home))] };
	});
	on("tool.call", { tool: toolNames(PLUGIN, operations) }, async ($, e, next) => {
		const io = ioOf($);
		const { home } = await placeOf($);
		const at = await sessionOf($, io, home);
		const roots = [at.roots.omp, at.roots.claude, at.roots.codex];
		const list = { kind: "folder" as const, folder: at.folder, current: at.file };
		const handlers = { read: readHandler(io, { roots, list, home }) };
		return (await dispatch(operations, handlers, e.tool, toolArguments(e))) ?? next(e);
	});
};
