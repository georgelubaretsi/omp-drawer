// What piebird-kagi-search's program works with, for Codex and the desktop apps: the Kagi tools
// over MCP, performed by the vault beside it, with the instructions about searching; and Codex's
// PreToolUse hook on web.run, which keeps web.run from searching while the "search" setting says so
// (core/search.ts). A call that finds Kagi down marks its session (marks.ts) for the hook.
import type { Io, Place } from "../kit/core/io";
import type { Parts } from "../kit/program/cli";
import type { HookAnswer, HookInput } from "../kit/program/hook";
import type { Search } from "../core/search";
import type { Marks } from "./marks";
import { kagiDown } from "../core/errors";
import { handlersFor } from "../core/handlers";
import { model } from "../core/model.gen";
import { operations } from "../core/operations.gen";
import { builtInOff, instructions, readSearch, VAULT } from "../core/search";
import { vaultPath } from "../kit/core/vault";
import { allow, deny } from "../kit/program/hook";
import manifest from "../plugin.json" with { type: "json" };

export const NAME = manifest.name;

/** Codex's web tool as its hooks name it: web.run, namespace and name joined. */
const WEB_RUN = "webrun";

/** What the program works with: the system's, or a test's. */
export interface Surroundings {
	readonly io: Io;
	/** Where it runs; the hook reads the project's settings from the session's folder instead. */
	readonly place: Place;
	readonly windows: boolean;
	readonly marks: Marks;
}

/** Whether a web.run call runs a web search: one or more search_query entries. */
function searches(input: unknown): boolean {
	const queries: unknown =
		typeof input === "object" && input !== null ? Reflect.get(input, "search_query") : undefined;
	return Array.isArray(queries) && queries.length > 0;
}

/** The session a call came from: Codex sends its id, the one its hooks get, as `_meta.sessionId`. */
function sessionOf(meta: Readonly<Record<string, unknown>>): string | undefined {
	return typeof meta.sessionId === "string" ? meta.sessionId : undefined;
}

async function webRun(input: HookInput, at: Surroundings): Promise<HookAnswer> {
	if (input.hookEventName !== "PreToolUse" || input.toolName !== WEB_RUN || !searches(input.toolInput)) return allow();
	const place = { ...at.place, project: input.cwd };
	const search = await readSearch(at.io, place).catch((): Search => "offered");
	if (!builtInOff(search, await at.marks.has(input.sessionId))) return allow();
	return deny(model.text("refused-web-run", { search }));
}

export async function kagiParts(at: Surroundings): Promise<Parts> {
	const search = await readSearch(at.io, at.place).catch((): Search => "offered");
	return {
		name: manifest.name,
		version: manifest.version,
		operations,
		handlers: handlersFor(at.io, vaultPath(at.place.plugin, VAULT, at.windows)),
		instructions: instructions(search),
		async afterCall({ outcome, meta }) {
			if (kagiDown(outcome)) await at.marks.set(sessionOf(meta));
		},
		hook: input => webRun(input, at),
	};
}
