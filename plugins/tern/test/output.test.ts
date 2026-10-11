// The tool's text for each outcome, as the templates lay it out.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { MAX_REQUEST_BYTES } from "../src/bridge";
import { answerText, failureText, MAX_OUTPUT_CHARS, type Request } from "../src/output";

const request = (appNapOn: () => boolean): Request => ({ pane: 3, dir: "/bridge", timeoutS: 2.5, appNapOn });
const notAsked = () => {
	throw new Error("App Nap is only asked about after a reload");
};
const unknown = (cause: string, more = "") =>
	`Outcome unknown: ${cause}. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again.${more}`;
const reloaded = " Tern's plugins were reloaded, so the next call can run (`state` was reset).";
const appNap =
	" App Nap is on for Tern, which can throttle a background Tern past its 50 ms plugin budget: ask the user to run `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern.";
const outcome = (cause: "cancelled" | "stopped" | "timedOut", wasReloaded: boolean) =>
	({ kind: "indeterminate", cause, reloaded: wasReloaded }) as const;
const answer = (fields: { ok: boolean; result: unknown; printed?: string; note?: string }) =>
	({ kind: "answer", window: "w", ...fields }) as const;

describe("the error for a call without an answer", () => {
	test("says what to do when the Tern half isn't loaded, took no request, or the call was too large", () => {
		const plugin = join(import.meta.dir, "..", "tern-plugin");
		expect(failureText({ kind: "not_loaded" }, request(notAsked))).toBe(
			`The omp-bridge Tern plugin is not loaded: its data folder /bridge does not exist. Install it with: tern plugin link "${plugin}" && tern plugin reload. If Tern runs with TERN_CONFIG_DIR, give omp the same value.`,
		);
		expect(failureText({ kind: "unclaimed" }, request(notAsked))).toBe(
			"No Tern window holding pane 3 (this omp's TERN_PANE) took the request, even after `tern plugin reload`; the code did not run. Is this pane's session open in a Tern window? Check `tern plugin list` and Tern's log.",
		);
		expect(failureText({ kind: "cancelled" }, request(notAsked))).toBe("Cancelled before Tern ran the code.");
		expect(failureText({ kind: "too_large", bytes: 70_000 }, request(notAsked))).toBe(
			`The request is 70000 bytes once JSON-encoded; Tern reads at most ${MAX_REQUEST_BYTES}. Nothing was sent. Split the code into smaller calls, or keep large data in a file and read it with tern.fs.read.`,
		);
	});

	test("names why the outcome is unknown, and after a reload whether App Nap is on", () => {
		expect(failureText(outcome("cancelled", false), request(notAsked))).toBe(
			unknown("cancelled after a Tern window took the request"),
		);
		expect(failureText(outcome("timedOut", false), request(notAsked))).toBe(unknown("no answer within 3 s"));
		const stopped =
			"the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed)";
		expect(
			failureText(
				outcome("stopped", true),
				request(() => false),
			),
		).toBe(unknown(stopped, reloaded));
		expect(
			failureText(
				outcome("stopped", true),
				request(() => true),
			),
		).toBe(unknown(stopped, reloaded + appNap));
	});
});

describe("the text for an answer", () => {
	test("shows what was printed, the result as JSON (nil when none) and a note", () => {
		expect(answerText(answer({ ok: true, result: { a: 1 }, printed: "hi", note: "shown as tostring()" }))).toBe(
			'printed:\nhi\n\nresult:\n{\n  "a": 1\n}\n\nnote: shown as tostring()',
		);
		expect(answerText(answer({ ok: true, result: undefined }))).toBe("result:\nnil");
	});

	test("cuts a long answer at its end, and throws a Lua error with what was printed", () => {
		const long = "x".repeat(MAX_OUTPUT_CHARS);
		const text = `result:\n${JSON.stringify(long)}`;
		expect(answerText(answer({ ok: true, result: long }))).toBe(
			`${text.slice(0, MAX_OUTPUT_CHARS)}\n… truncated at ${MAX_OUTPUT_CHARS} of ${text.length} characters; return less (fields, a slice, a count)`,
		);
		expect(() => answerText(answer({ ok: false, result: "boom", printed: "before" }))).toThrow(
			"Lua error: boom\n\nprinted:\nbefore",
		);
	});
});
