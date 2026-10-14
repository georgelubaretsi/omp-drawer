// piebird-kagi-search's Claude Code part, a mod: the Kagi tools, performed by the plugin's vault,
// and the "search" setting (core/search.ts) applied to Claude Code's built-in WebSearch. While it
// should stay out of the way it waits behind tool search, and a call to it is refused with a word
// on what to use instead; it also runs while the vault isn't there. The model's instructions about
// searching are a block in its context. A hook that fails is skipped, so a broken mod lets
// WebSearch run.
import type { Api, Register } from "claude-code";
import type { Io, Place } from "../../kit/core/io";
import type { Search } from "../../core/search";
import { contextBlock } from "../../kit/claude/context";
import { FS_READ_LIMIT, printerOf, stdoutPieces } from "../../kit/claude/pieces";
import { dispatch, toolArguments, toolNames, toolSpecs } from "../../kit/claude/tools";
import { vaultPath } from "../../kit/core/vault";
import { handlersFor } from "../../core/handlers";
import { model } from "../../core/model.gen";
import { operations } from "../../core/operations.gen";
import { builtInOff, instructions, PLUGIN, readSearch, VAULT } from "../../core/search";

/** Claude Code's built-in search tool. */
const WEB_SEARCH = "WebSearch";

/** Whether a Kagi call has failed in this conversation, which brings WebSearch back with "first". */
let kagiFailed = false;
/** The "search" setting, read once per conversation. */
let search: Promise<Search> | undefined;

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

async function vaultOf($: Api): Promise<string> {
	return vaultPath($.plugin.root, VAULT, (await $.env.get("OS")) === "Windows_NT");
}

/**
 * The setting, given Claude Code's own choice (read from the person's settings only, never a
 * project's); "offered" when it can't be read, so nothing is held back.
 */
function setting($: Api, choice: unknown): Promise<Search> {
	search ??= placeOf($)
		.then(place => readSearch(ioOf($), place, { person: choice }))
		.catch((): Search => "offered");
	return search;
}

/** Whether Kagi can't be used here: a call failed, or the plugin has no vault built. */
async function kagiOut($: Api): Promise<boolean> {
	return kagiFailed || !(await $.fs.exists(await vaultOf($)));
}

export const register: Register = (on, options) => {
	on("session.start", async ($, e, next) => {
		for (const spec of toolSpecs(operations)) await $.tool.register(spec);
		return next(e);
	});
	// /clear, /resume and /branch end the conversation without reloading the module: the next one
	// starts over, maybe in another project.
	on("session.end", async ($, e, next) => {
		kagiFailed = false;
		search = undefined;
		$.ui.invalidate("tool.describe");
		return next(e);
	});
	on("prompt.context", async ($, e, next) => {
		const r = await next(e);
		const block = contextBlock(PLUGIN, instructions(await setting($, options.search)));
		return { ...r, blocks: [...r.blocks, block] };
	});
	on("tool.call", { tool: toolNames(PLUGIN, operations) }, async ($, e, next) => {
		const handlers = handlersFor(ioOf($), await vaultOf($), () => {
			if (kagiFailed) return;
			kagiFailed = true;
			// Claude Code asks tool.describe again, which puts WebSearch back where it was.
			$.ui.invalidate("tool.describe");
		});
		return (await dispatch(operations, handlers, e.tool, toolArguments(e))) ?? next(e);
	});
	on("tool.describe", { tool: WEB_SEARCH }, async ($, e, next) => {
		const described = await next(e);
		const off = builtInOff(await setting($, options.search), await kagiOut($));
		return off ? { ...described, isDeferred: true } : described;
	});
	on("tool.call", { tool: WEB_SEARCH }, async ($, e, next) => {
		const value = await setting($, options.search);
		if (!builtInOff(value, await kagiOut($))) return next(e);
		return { deny: model.text("refused-web-search", { search: value }).text };
	});
};
