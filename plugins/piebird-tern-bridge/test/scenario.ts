// The scripted session behind piebird-tern-bridge's "what the model sees" page
// (tools/model-page.ts): omp in Tern's pane 4 runs Lua in its window. A stand-in for the bridge
// answers each call as the Tern half would, one outcome of each kind.
import type { Outcome } from "../core/outcome";
import type { Surroundings } from "../src/index";
import type { Scenario, Setup, Step } from "../../../tools/model-page/types";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { operations } from "../core/operations.gen";
import { traceMessages } from "../kit/core/model";
import { ternInOmp } from "../src/index";

const SESSIONS = "return cx.sessions:list()";
const PRINTS = 'print("2 panes") return #cx.layout:panes()';
const BROKEN = "return cx.nope.list()";
const OTHER_PANE = "return cx.pane:id()";
const SLOW = "while true do end";
const BEFORE_INSTALL = "return 1";

/** What the Tern half answers to each call, by its code. */
const ANSWERS: Readonly<Record<string, Outcome>> = {
	[SESSIONS]: { kind: "answer", ok: true, result: [{ id: 12, title: "shop-api" }], window: "w1" },
	[PRINTS]: { kind: "answer", ok: true, result: 2, printed: "2 panes", window: "w1" },
	[BROKEN]: { kind: "answer", ok: false, result: "attempt to index nil with 'list'", window: "w1" },
	[OTHER_PANE]: { kind: "unclaimed" },
	[SLOW]: { kind: "indeterminate", cause: "stopped", reloaded: true },
	[BEFORE_INSTALL]: { kind: "not_loaded" },
};

async function setup(home: string): Promise<Setup> {
	const project = join(home, "shop-api");
	await mkdir(project, { recursive: true });
	const session = (id: string) => ({ id, file: join(home, "sessions", `${id}.jsonl`) });
	return { project, sessions: { omp: session("omp"), claude: session("claude"), codex: session("codex") } };
}

function surroundings(made: Setup): Surroundings {
	const home = join(made.project, "..");
	return {
		pane: 4,
		dir: join(home, "Library", "Application Support", "Tern", "plugin-data", "piebird-tern-bridge"),
		pluginDir: join(home, "plugins", "piebird-tern-bridge", "so.stencil.tern"),
		call: async options => ANSWERS[options.code] ?? { kind: "cancelled" },
		reload: async () => undefined,
		appNapOn: () => false,
	};
}

const call = (title: string, code: string): Step => ({ kind: "call", title, tool: "tern_lua", input: { code } });

const STEPS: readonly Step[] = [
	{ kind: "start", title: "The session starts" },
	call("A value back as JSON", SESSIONS),
	call("Printed output with the result", PRINTS),
	call("A Lua error", BROKEN),
	call("No window holds the pane", OTHER_PANE),
	call("The window stops answering", SLOW),
	call("The Tern half isn't installed yet", BEFORE_INSTALL),
];

export const scenario: Scenario = {
	plugin: "piebird-tern-bridge",
	setup,
	steps: STEPS,
	operations,
	traceMessages,
	shells: { omp: (pi, made) => Reflect.apply(ternInOmp, undefined, [pi, surroundings(made)]) },
};
