// piebird-workflow-rules' demo: the user reports one bug; the rules have the agent weigh it, name
// its class and look for other cases (shipping has the same flaw as the total), test the fix and
// record it in a changelog. omp first, then Claude Code and Codex, a tab each, each from the
// project as it started. The captions say what the rules ask, not what one run did.
import type { Demo } from "../../tools/demo/director";
import type { Scenario } from "../../tools/demo/record";
import { writeProject } from "../../tools/demo/project";
import { shopApi } from "../shop-api";

const BUG = "A gift card bigger than the cart makes the total negative. Fix it.";

/** Puts the project in the new tab back as it started (`git fresh`, set up below). */
async function fresh(d: Demo): Promise<void> {
	await d.type("git fresh && clear");
	await d.key("Enter");
	await d.wait(1000);
}

export default {
	plugins: ["piebird-workflow-rules"],
	agents: ["claude", "codex"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		// `git fresh` puts the project back as it started, for the next agent's tab.
		const alias = "!git reset -q --hard $(git rev-list --max-parents=0 HEAD) && git clean -qfd";
		Bun.spawnSync(["git", "config", "alias.fresh", alias], { cwd: s.project });
	},
	async run(d) {
		d.caption("piebird-workflow-rules", "rules on how omp, Claude Code and Codex work");
		await d.wait(2000);
		await d.startOmp();
		d.caption("Report one bug");
		await d.prompt(BUG, { fast: 4 });
		d.caption("The rules shape the fix", "the kind of bug, its other cases, a test, a changelog entry");
		await d.wait(5000);
		await d.newTab();
		await fresh(d);
		await d.startAgent("claude");
		d.caption("Claude Code", "the same bug, from the start, with the same rules");
		await d.prompt(BUG, { fast: 4 });
		await d.wait(4000);
		await d.newTab();
		await fresh(d);
		await d.startAgent("codex");
		d.caption("Codex", "the same bug, with the rules as skills");
		await d.prompt(BUG, { fast: 4 });
		await d.wait(4000);
		d.caption(
			"plugin install piebird-workflow-rules@piebird",
			"omp, claude and codex · github.com/georgelubaretsi/piebird",
		);
		await d.wait(3000);
	},
} satisfies Scenario;
