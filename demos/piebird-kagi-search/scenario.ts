// piebird-kagi-search's demo: the same question about this week's software, answered with Kagi
// search in each agent the plugin works in: omp, Claude Code and Codex, a tab each.
import type { Scenario } from "../../tools/demo/record";
import { writeProject } from "../../tools/demo/project";
import { shopApi } from "../shop-api";

const QUESTION = "What's the latest Bun release, and what changed in it? Search the web.";

export default {
	plugins: ["piebird-kagi-search"],
	agents: ["claude", "codex"],
	credentials: ["kagi"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
	},
	async run(d) {
		d.caption("piebird-kagi-search", "Kagi web search in omp, Claude Code and Codex");
		await d.wait(2000);
		await d.startOmp();
		d.caption("omp", "on Claude Haiku 5.5");
		await d.prompt(QUESTION, { fast: 4 });
		d.caption("Searched with Kagi, with sources", "only the Kagi tools you choose");
		await d.wait(4000);
		await d.newTab();
		await d.startAgent("claude");
		d.caption("Claude Code", "the same plugin, on Claude Haiku 5.5");
		await d.prompt(QUESTION, { fast: 4 });
		await d.wait(4000);
		await d.newTab();
		await d.startAgent("codex");
		d.caption("Codex", "the same plugin, on gpt-6.1-sol");
		await d.prompt(QUESTION, { fast: 4 });
		await d.wait(4000);
		d.caption(
			"piebird installer, for omp, Claude Code, Codex, ChatGPT and Claude",
			"github.com/georgelubaretsi/piebird",
		);
		await d.wait(3500);
	},
} satisfies Scenario;
