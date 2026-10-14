// What the vault's declared errors mean to the model (model.ftl's error-<id>), and which of them
// say Kagi isn't working, as opposed to a call the model can fix.
import type { ModelText, Variables } from "../kit/core/model";
import type { Outcome } from "../kit/core/operations";
import type { Fields } from "./data";
import { model } from "./model.gen";

/** Errors after which the agent's own web search is back with the "first" setting (core/search.ts). */
const KAGI_DOWN: ReadonlySet<string> = new Set([
	"sign-in-needed",
	"secret-store",
	"http-status",
	"cannot-reach",
	"reading",
	"vault",
	"failed",
]);

/** Whether `outcome` says Kagi can't be searched now, rather than that the call was wrong. */
export function kagiDown(outcome: Outcome): boolean {
	return !outcome.ok && KAGI_DOWN.has(outcome.error);
}

function variablesOf(fields: Fields): Variables {
	return Object.fromEntries(
		Object.entries(fields).filter(
			(e): e is [string, string | number] => typeof e[1] === "string" || typeof e[1] === "number",
		),
	);
}

/**
 * The declared error `id` with its variables, as the model reads it. A batch's error names its
 * query. An id the catalog lacks, or a variable its message needs and didn't get, means the vault
 * and this core disagree: that reads as the vault failing, with what it sent.
 */
export function errorText(id: string, variables: Fields): ModelText {
	const { query, ...rest } = variablesOf(variables);
	let text: ModelText;
	try {
		text = model.textById(`error-${id}`, rest);
	} catch {
		text = model.text("error-failed", { cause: `${id} ${JSON.stringify(variables)}` });
	}
	return query === undefined ? text : model.text("error-in-query", { query, error: text.text });
}

/** Where the session comes from (the vault's secrets.Source). */
export function sourceText(from: Fields): ModelText {
	const at = (key: string) => (typeof from[key] === "string" ? from[key] : "");
	return model.text("source", { kind: at("kind"), env: at("env"), path: at("path") });
}
