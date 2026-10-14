// The tool's answer for each outcome of a call: an answer's text, or the declared error saying what
// happened and what to do.
import type { Outcome } from "../core/outcome";
import type { Request } from "../core/output";
import { describe, expect, test } from "bun:test";
import { MAX_REQUEST_BYTES } from "../core/outcome";
import { MAX_OUTPUT_CHARS, toolOutcome } from "../core/output";

const request = (appNapOn: () => boolean): Request => ({
	pane: 3,
	dir: "/bridge",
	pluginDir: "/plugin/so.stencil.tern",
	timeoutS: 2.5,
	appNapOn,
});
const notAsked = () => {
	throw new Error("App Nap is only asked about after a reload");
};
const said = (outcome: Outcome, appNap: () => boolean = notAsked) => toolOutcome(outcome, request(appNap)).text.text;
const unknown = (cause: string, more = "") =>
	`Outcome unknown: ${cause}. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again.${more}`;
const reloaded = " Tern's plugins were reloaded, so the next call can run (`state` was reset).";
const appNap =
	" App Nap is on for Tern, which can throttle a background Tern past its 50 ms plugin budget: ask the user to run `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern.";
const indeterminate = (cause: "cancelled" | "stopped" | "timedOut", wasReloaded: boolean): Outcome => ({
	kind: "indeterminate",
	cause,
	reloaded: wasReloaded,
});
const answer = (fields: { ok: boolean; result: unknown; printed?: string; note?: string }): Outcome => ({
	kind: "answer",
	window: "w",
	...fields,
});

describe("the error for a call without an answer", () => {
	test("says what to do when the Tern half isn't loaded, took no request, or the call was too large", () => {
		expect(toolOutcome({ kind: "not_loaded" }, request(notAsked))).toMatchObject({ ok: false, error: "not-loaded" });
		expect(said({ kind: "not_loaded" })).toBe(
			'The piebird-tern-bridge Tern plugin is not loaded: its data folder /bridge does not exist. omp installs it when it starts in a Tern pane, so if omp just started, try again in a moment. Otherwise install it with: tern plugin install "/plugin/so.stencil.tern" --force. If Tern runs with TERN_CONFIG_DIR, give omp the same value.',
		);
		expect(said({ kind: "unclaimed" })).toBe(
			"No Tern window holding pane 3 (this omp's TERN_PANE) took the request, even after `tern plugin reload`; the code did not run. Is this pane's session open in a Tern window? Check `tern plugin list` and Tern's log.",
		);
		expect(said({ kind: "cancelled" })).toBe("Cancelled before Tern ran the code.");
		expect(said({ kind: "too_large", bytes: 70_000 })).toBe(
			`The request is 70000 bytes once JSON-encoded; Tern reads at most ${MAX_REQUEST_BYTES}. Nothing was sent. Split the code into smaller calls, or keep large data in a file and read it with tern.fs.read.`,
		);
	});

	test("names why the outcome is unknown, and after a reload whether App Nap is on", () => {
		expect(said(indeterminate("cancelled", false))).toBe(unknown("cancelled after a Tern window took the request"));
		expect(said(indeterminate("timedOut", false))).toBe(unknown("no answer within 3 s"));
		const stopped =
			"the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed)";
		expect(said(indeterminate("stopped", true), () => false)).toBe(unknown(stopped, reloaded));
		expect(said(indeterminate("stopped", true), () => true)).toBe(unknown(stopped, reloaded + appNap));
	});
});

describe("the text for an answer", () => {
	test("shows what was printed, the result as JSON (nil when none) and a note", () => {
		expect(said(answer({ ok: true, result: { a: 1 }, printed: "hi", note: "shown as tostring()" }))).toBe(
			'printed:\nhi\n\nresult:\n{\n  "a": 1\n}\n\nnote: shown as tostring()',
		);
		expect(said(answer({ ok: true, result: undefined }))).toBe("result:\nnil");
	});

	test("cuts a long answer at its end, and words a Lua error with what was printed as a tool error", () => {
		const long = "x".repeat(MAX_OUTPUT_CHARS);
		const text = `result:\n${JSON.stringify(long)}`;
		expect(said(answer({ ok: true, result: long }))).toBe(
			`${text.slice(0, MAX_OUTPUT_CHARS)}\n… truncated at ${MAX_OUTPUT_CHARS} of ${text.length} characters; return less (fields, a slice, a count)`,
		);
		const failed = answer({ ok: false, result: "boom", printed: "before" });
		expect(toolOutcome(failed, request(notAsked))).toMatchObject({ ok: false, error: "lua-error" });
		expect(said(failed)).toBe("Lua error: boom\n\nprinted:\nbefore");
	});

	test("the tool's description names the timeout limits the code applies", async () => {
		const { operations } = await import("../core/operations.gen");
		const { DEFAULT_TIMEOUT_S, MAX_TIMEOUT_S } = await import("../src/index");
		const description = operations.byId.get("lua")?.tool?.inputSchema;
		expect(JSON.stringify(description)).toContain(`(default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S})`);
	});
});
