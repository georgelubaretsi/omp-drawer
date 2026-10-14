// piebird-threads's Claude Code part, a mod: a block in the conversation's context holding the
// plugin's rule (rules/threads.md, which points the agent to the threads skill) and the project's
// open threads (core/update.ts). Claude Code computes it at the start of a conversation and again
// after compaction or /clear.
import type { Api, Register } from "claude-code";
import type { Io, Place } from "../../kit/core/io";
import { contextBlock } from "../../kit/claude/context";
import { FS_READ_LIMIT, printerOf, stdoutPieces } from "../../kit/claude/pieces";
import { joinText } from "../../kit/core/model";
import { PLUGIN } from "../../core/folder";
import { ruleText, threadsUpdate } from "../../core/update";

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

export const register: Register = (on, options) => {
	on("prompt.context", async ($, e, next) => {
		const r = await next(e);
		const rule = ruleText(await $.fs.read(`${$.plugin.root}/rules/threads.md`));
		// Claude Code reads plugin options from the person's settings only, never a project's.
		const at = { choice: { person: options.folder }, last: undefined, now: Date.now() / 1000 };
		// A list that can't be read leaves the rule alone in the block.
		const list = await threadsUpdate(ioOf($), await placeOf($), at).catch(() => undefined);
		const text = joinText(list === undefined ? [rule] : [rule, list], "paragraph");
		return { ...r, blocks: [...r.blocks, contextBlock(PLUGIN, text)] };
	});
};
