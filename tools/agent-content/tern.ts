// The tern plugin's outputs for templates/tern.md: the tern_lua tool, its answers and errors for
// made-up outcomes, and the rules and skills it ships. The wording around them is in the template.
import type { Outcome } from "../../plugins/tern/src/bridge";
import { answerText, failureText, type Request } from "../../plugins/tern/src/output";
import { templates } from "../../plugins/tern/src/templates";
import type { Doc } from "./doc";
import { rulesSection, skillsSection } from "./shipped";

const BRIDGE = "~/Library/Application Support/Tern/plugin-data/omp-bridge";

type Answer = Extract<Outcome, { kind: "answer" }>;
const answer = (fields: Omit<Answer, "kind" | "window">): Answer => ({ kind: "answer", window: "w", ...fields });
const request = (appNap: boolean): Request => ({ pane: 42, dir: BRIDGE, timeoutS: 130, appNapOn: () => appNap });

function answers(doc: Doc): Record<string, unknown> {
	const agents = [
		{ pane: 41, state: "idle", title: "review checkout PR" },
		{ pane: 42, state: "working", title: "fix flaky test" },
	];
	const note = "the result was not JSON-encodable, so it is shown as tostring(): function: 0x6000034c";
	const long = answerText(answer({ ok: true, result: "x".repeat(70_000) }));
	return {
		returned: doc.example(
			'tern_lua {"code":"print(#cx.agents:list()) return cx.agents:list()"}',
			answerText(answer({ ok: true, printed: "2", result: agents })),
		),
		nothing: doc.example(
			'tern_lua {"code":"cx:toast(\\"info\\", \\"done\\")"}',
			answerText(answer({ ok: true, result: undefined })),
		),
		notJson: doc.quote(answerText(answer({ ok: true, result: "function: 0x6000034c", note }))),
		truncated: doc.quote(long.split("\n").at(-1) ?? ""),
	};
}

async function failures(doc: Doc): Promise<Record<string, unknown>> {
	const unknown = (cause: "cancelled" | "stopped" | "timedOut", reloaded: boolean, appNap: boolean) =>
		doc.cell(failureText({ kind: "indeterminate", cause, reloaded }, request(appNap)));
	const luaError = answer({ ok: false, result: "tern_lua:1: attempt to index nil with 'list'", printed: "starting" });
	const noWindow = { error: "omp-bridge: Tern gave the callback no window context", printed: undefined };
	return {
		luaError: doc.quote(await doc.result(() => answerText(luaError))),
		notLoaded: doc.cell(failureText({ kind: "not_loaded" }, request(false))),
		unclaimed: doc.cell(failureText({ kind: "unclaimed" }, request(false))),
		cancelled: doc.cell(failureText({ kind: "cancelled" }, request(false))),
		tooLarge: doc.cell(failureText({ kind: "too_large", bytes: 1_310_720 }, request(false))),
		unknownCancelled: unknown("cancelled", false, false),
		unknownTimedOut: unknown("timedOut", false, false),
		unknownStopped: unknown("stopped", true, false),
		unknownAppNap: unknown("stopped", true, true),
		noTern: doc.cell(templates.errors.noTern.render()),
		nullAnswer: doc.cell(templates.errors.nullAnswer.render({ file: `${BRIDGE}/res/7f3a.json` })),
		noWindow: doc.cell(templates.luaError.render(noWindow)),
	};
}

/** The values for templates/tern.md; `plugin` is the tern plugin's folder. */
export async function ternValues(doc: Doc, plugin: string): Promise<Record<string, unknown>> {
	const timeout = templates.tool.text("parameters.timeout", { defaultSeconds: 130, maxSeconds: 600 });
	return {
		toolDescription: doc.quote(templates.tool.render()),
		parameters: { code: doc.cell(templates.tool.text("parameters.code")), timeout: doc.cell(timeout) },
		...answers(doc),
		...(await failures(doc)),
		rules: rulesSection(doc, plugin),
		skills: skillsSection(doc, plugin),
	};
}
