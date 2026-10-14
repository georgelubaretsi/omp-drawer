// The tool's answer for each outcome of a call (core/outcome.ts): an answer's printed output,
// result and note, or the declared error saying what happened and what to do.
import type { ModelText } from "../kit/core/model";
import type { Outcome as ToolOutcome } from "../kit/core/operations";
import type { Outcome } from "./outcome";
import { joinText } from "../kit/core/model";
import { model } from "./model.gen";
import { MAX_REQUEST_BYTES } from "./outcome";

/** The most of an answer the tool returns. */
export const MAX_OUTPUT_CHARS = 60_000;

/** What a call's error says besides its outcome. */
export interface Request {
	readonly pane: number;
	/** The bridge's folder, and the Tern half's, to install it from. */
	readonly dir: string;
	readonly pluginDir: string;
	readonly timeoutS: number;
	/** Whether App Nap may throttle Tern; asked only after a reload. */
	readonly appNapOn: () => boolean;
}

type Answer = Extract<Outcome, { kind: "answer" }>;

/** The declared error for a call that got no answer, with its text. */
function failure(outcome: Exclude<Outcome, { kind: "answer" }>, request: Request): { id: string; text: ModelText } {
	if (outcome.kind === "not_loaded") {
		const text = model.text("error-not-loaded", { dir: request.dir, pluginDir: request.pluginDir });
		return { id: "not-loaded", text };
	}
	if (outcome.kind === "unclaimed")
		return { id: "unclaimed", text: model.text("error-unclaimed", { pane: request.pane }) };
	if (outcome.kind === "cancelled") return { id: "cancelled", text: model.text("error-cancelled") };
	if (outcome.kind === "too_large") {
		const text = model.text("error-too-large", { bytes: outcome.bytes, max: MAX_REQUEST_BYTES });
		return { id: "too-large", text };
	}
	const reloaded = outcome.reloaded ? "yes" : "no";
	const appNap = outcome.reloaded && request.appNapOn() ? "yes" : "no";
	const seconds = Math.round(request.timeoutS);
	return { id: "unknown", text: model.text("error-unknown", { cause: outcome.cause, seconds, reloaded, appNap }) };
}

const printed = (answer: Answer): ModelText[] =>
	answer.printed ? [model.text("answer-printed", { printed: answer.printed })] : [];

/** An answer's text: what was printed, the result as JSON (nil when none), the note; cut when long. */
function answerText(answer: Answer): ModelText {
	const result =
		answer.result === undefined
			? model.text("answer-nil")
			: model.text("answer-result", { result: JSON.stringify(answer.result, null, 2) });
	const note = answer.note ? [model.text("answer-note", { note: answer.note })] : [];
	const text = joinText([...printed(answer), result, ...note], "paragraph");
	if (text.text.length <= MAX_OUTPUT_CHARS) return text;
	const cut = { text: text.text.slice(0, MAX_OUTPUT_CHARS), max: MAX_OUTPUT_CHARS, length: text.text.length };
	return model.text("answer-truncated", cut);
}

/** The tool's outcome for a call's: its answer, a Lua error with what was printed, or why there is none. */
export function toolOutcome(outcome: Outcome, request: Request): ToolOutcome {
	if (outcome.kind !== "answer") {
		const { id, text } = failure(outcome, request);
		return { ok: false, error: id, text };
	}
	if (!outcome.ok) {
		const error = model.text("error-lua-error", { error: String(outcome.result) });
		return { ok: false, error: "lua-error", text: joinText([error, ...printed(outcome)], "paragraph") };
	}
	return { ok: true, text: answerText(outcome), data: { pane: request.pane, ok: true } };
}
