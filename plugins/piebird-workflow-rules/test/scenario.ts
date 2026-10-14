// The scripted session behind piebird-workflow-rules's "what the model sees" page
// (tools/model-page.ts): a session starts, with the plugin installed under a made-up home folder.
// omp reads the rules itself (the page's last section); Claude Code gets them from the mod.
import type { Scenario, Setup, Step } from "../../../tools/model-page/types";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { register } from "../com.anthropic.claudecode/hooks/register";
import { traceMessages } from "../kit/core/model";

async function setup(home: string): Promise<Setup> {
	const project = join(home, "shop-api");
	const plugin = join(home, "plugins", "piebird-workflow-rules");
	await mkdir(project, { recursive: true });
	await cp(join(import.meta.dir, "..", "rules"), join(plugin, "rules"), { recursive: true });
	const session = (id: string) => ({ id, file: join(home, "sessions", `${id}.jsonl`) });
	return { project, plugin, sessions: { omp: session("omp"), claude: session("claude"), codex: session("codex") } };
}

const STEPS: readonly Step[] = [{ kind: "start", title: "The session starts" }];

export const scenario: Scenario = {
	plugin: "piebird-workflow-rules",
	setup,
	steps: STEPS,
	traceMessages,
	shells: { claude: register },
};
