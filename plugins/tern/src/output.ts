// The tool's text: an answer, or the error for a call that got none, both from ./templates.
import { join } from "node:path";
import { MAX_REQUEST_BYTES, type Outcome } from "./bridge";
import { templates } from "./templates";

const TERN_PLUGIN_DIR = join(import.meta.dir, "..", "tern-plugin");
/** The most of an answer the tool returns. */
export const MAX_OUTPUT_CHARS = 60_000;

/** What a call's error says besides its outcome. */
export interface Request {
	pane: number;
	dir: string;
	timeoutS: number;
	/** Whether App Nap may throttle Tern; asked only after a reload. */
	appNapOn: () => boolean;
}

/** The tool's error for a call that got no answer. */
export function failureText(outcome: Exclude<Outcome, { kind: "answer" }>, request: Request): string {
	const { errors } = templates;
	switch (outcome.kind) {
		case "not_loaded":
			return errors.notLoaded.render({ dir: request.dir, pluginDir: TERN_PLUGIN_DIR });
		case "unclaimed":
			return errors.unclaimed.render({ pane: request.pane });
		case "cancelled":
			return errors.cancelled.render();
		case "indeterminate":
			return errors.unknown.render({
				cause: errors.unknown.text(`causes.${outcome.cause}`, { seconds: Math.round(request.timeoutS) }),
				reloaded: outcome.reloaded,
				appNap: outcome.reloaded && request.appNapOn(),
			});
		case "too_large":
		default:
			return errors.tooLarge.render({ bytes: outcome.bytes, max: MAX_REQUEST_BYTES });
	}
}

/** The tool's text for an answer; a Lua error throws. */
export function answerText(outcome: Extract<Outcome, { kind: "answer" }>): string {
	if (!outcome.ok)
		throw new Error(templates.luaError.render({ error: String(outcome.result), printed: outcome.printed }));
	const text = templates.answer.render({
		printed: outcome.printed,
		result: outcome.result === undefined ? undefined : JSON.stringify(outcome.result, null, 2),
		note: outcome.note,
	});
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	const cut = { text: text.slice(0, MAX_OUTPUT_CHARS), max: MAX_OUTPUT_CHARS, length: text.length };
	return templates.answer.text("truncated", cut);
}
