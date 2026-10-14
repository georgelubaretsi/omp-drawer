// The scripted session behind piebird-agent-variants's "what the model sees" page
// (tools/model-page.ts): a project with a designer agent, two models signed in (one free, one paid
// per token), and the user asking for a variant on one of them. omp's own commands answer as a
// clean checkout would.
import type { Surroundings } from "../src/index";
import type { Scenario, Setup, Step } from "../../../tools/model-page/types";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { operations } from "../core/operations.gen";
import { traceMessages } from "../kit/core/model";
import { variantsInOmp } from "../src/index";

async function setup(home: string): Promise<Setup> {
	const project = join(home, "shop-api");
	await mkdir(join(project, ".omp", "agents"), { recursive: true });
	const designer = "---\nname: designer\ndescription: UI specialist\n---\n\nDesign the interface.\n";
	await writeFile(join(project, ".omp", "agents", "designer.md"), designer);
	const session = (id: string) => ({ id, file: join(home, "sessions", `${id}.jsonl`) });
	return { project, sessions: { omp: session("omp"), claude: session("claude"), codex: session("codex") } };
}

const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const paid = { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 1.5 };

/** The session's models and omp's commands: `omp config path` names the home's omp folder. */
function surroundings(made: Setup): Surroundings {
	const home = join(made.project, "..");
	return {
		models: () => [
			{ provider: "opencode", id: "ox-alpha-free", name: "Ox Alpha", cost: zero, efforts: [], oauth: false },
			{ provider: "openrouter", id: "ox-alpha", name: "Ox Alpha", cost: paid, efforts: ["high"], oauth: false },
		],
		execute: async (command, args) =>
			command === "omp" && args[0] === "config"
				? { code: 0, stdout: join(home, ".omp", "agent"), stderr: "" }
				: { code: 0, stdout: "", stderr: "" },
		now: () => "2026-10-12T09:00:00.000Z",
	};
}

const approved = { projectWriteApproved: true };
const call = (title: string, input: Readonly<Record<string, unknown>>): Step => ({
	kind: "call",
	title,
	tool: "agent_variant_setup",
	input,
});

const STEPS: readonly Step[] = [
	{ kind: "start", title: "The session starts" },
	call("Before the project's instructions are checked", { modelQuery: "ox alpha" }),
	call("A paid route the user hasn't approved", { modelQuery: "ox alpha", includePaidFallbacks: true, ...approved }),
	call("A variant on the free route", { sourceAgent: "designer", modelQuery: "ox alpha free", ...approved }),
	call("The same variant again", { sourceAgent: "designer", modelQuery: "ox alpha free", ...approved }),
	call("A model no one signed in to", { modelQuery: "nothing", thinking: "high", ...approved }),
	call("A name with a space", { modelQuery: "ox alpha free", targetName: "my variant", ...approved }),
];

export const scenario: Scenario = {
	plugin: "piebird-agent-variants",
	setup,
	steps: STEPS,
	operations,
	traceMessages,
	shells: { omp: (pi, made) => Reflect.apply(variantsInOmp, undefined, [pi, surroundings(made)]) },
};
