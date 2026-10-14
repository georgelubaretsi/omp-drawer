// The "search" setting (core/settings.json) and what follows from it in every agent: what the model
// is told, and whether the agent's own web search stays out of the way. With "only" it always
// does; with "first" until a Kagi call fails in the session (kagiDown, core/errors.ts), so the
// agent searches with Kagi and never has to fail a call to learn it; with "offered" never.
import type { Io, Place } from "../kit/core/io";
import type { ModelText } from "../kit/core/model";
import { readSettings } from "../kit/core/settings";
import { model } from "./model.gen";
import { declared } from "./settings.gen";

export const PLUGIN = "piebird-kagi-search";

/** The vault's program name (catalog.json `program`). */
export const VAULT = "kagi-vault";

export type Search = "only" | "first" | "offered";

function isSearch(value: unknown): value is Search {
	return value === "only" || value === "first" || value === "offered";
}

/**
 * The setting where the agent works at `place`, given the agent's own `choice` (its settings screen;
 * "shared", none or a value that isn't a choice follow the settings files).
 */
export async function readSearch(io: Io, place: Place, choice: unknown): Promise<Search> {
	const agent = typeof choice === "string" ? { search: choice } : {};
	const { values } = await readSettings(io, place, { plugin: PLUGIN, declared, agent });
	const value = values.search?.value;
	return isSearch(value) ? value : "first";
}

/** Whether the agent's own web search stays out of the way, given whether Kagi failed in the session. */
export function builtInOff(search: Search, kagiFailed: boolean): boolean {
	return search === "only" || (search === "first" && !kagiFailed);
}

/** What the model is told about searching. */
export function instructions(search: Search): ModelText {
	return model.text("instructions", { search });
}
