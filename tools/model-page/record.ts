// `bun tools/model-page/record.ts <plugin>` runs the plugin's scripted session through each of its
// shells and prints its page. tools/model-page.ts starts it with HOME set to a made-up home folder
// (Bun reads the home folder once, at start), so the session reads only the scenario's files.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { recordClaude } from "./claude";
import { recordOmp } from "./omp";
import { recordProgram } from "./program";
import { shippedSection } from "./shipped";
import { renderPage } from "./render";
import type { Harness, Scenario, Seen } from "./types";

const ROOT = join(import.meta.dir, "..", "..");

function isScenario(value: unknown): value is Scenario {
	if (typeof value !== "object" || value === null) return false;
	const has = (key: string, type: string) => typeof Reflect.get(value, key) === type;
	return (
		has("plugin", "string") &&
		has("setup", "function") &&
		has("traceMessages", "function") &&
		Array.isArray(Reflect.get(value, "steps"))
	);
}

/** What the harnesses gave, with the made-up home as /home/user, also as Claude Code spells a project folder under it. */
function neutral(seen: Partial<Record<Harness, Seen[][]>>, home: string): Partial<Record<Harness, Seen[][]>> {
	const fix = (text: string) =>
		text.replaceAll(home, "/home/user").replaceAll(home.replace(/[^a-zA-Z0-9]/g, "-"), "-home-user");
	const fixSeen = (s: Seen): Seen =>
		s.kind === "tool"
			? {
					...s,
					description: fix(s.description),
					parameters: Object.fromEntries(Object.entries(s.parameters).map(([k, v]) => [k, fix(v)])),
				}
			: { ...s, text: fix(s.text) };
	return Object.fromEntries(
		Object.entries(seen).map(([harness, steps]) => [harness, steps.map(step => step.map(fixSeen))]),
	);
}

async function main(plugin: string): Promise<void> {
	const dir = join(ROOT, "plugins", plugin);
	const loaded: unknown = await import(join(dir, "test", "scenario.ts"));
	const scenario: unknown =
		typeof loaded === "object" && loaded !== null ? Reflect.get(loaded, "scenario") : undefined;
	if (!isScenario(scenario)) throw new Error(`plugins/${plugin}/test/scenario.ts exports no scenario`);
	const home = homedir();
	const setup = await scenario.setup(home);
	// This process records one session: its clock may stand still at the session's time.
	if (setup.now !== undefined) {
		const now = Date.parse(setup.now);
		Date.now = () => now;
	}
	const { omp, claude, codex } = scenario.shells;
	const seen = {
		...(omp === undefined ? {} : { omp: await recordOmp(omp, scenario, setup) }),
		...(claude === undefined
			? {}
			: { claude: await recordClaude(claude, scenario, setup, { home, plugin: setup.plugin ?? dir }) }),
		...(codex === undefined ? {} : { codex: await recordProgram(codex, scenario, setup) }),
	};
	const catalog = await readFile(join(dir, "core", "model.ftl"), "utf8");
	const shipped = shippedSection(dir);
	const page = renderPage({ plugin, steps: scenario.steps, seen: neutral(seen, home), catalog, shipped });
	process.stdout.write(page);
}
await main(Bun.argv[2] ?? "");
