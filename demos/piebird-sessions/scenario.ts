// piebird-sessions's demo: an earlier session in the project settled how the cart cache works;
// a new session finds what was decided and quotes the user's own words, with the line. The same in
// omp, Claude Code and Codex, a tab each, each with an earlier session of its own.
import type { Scenario } from "../../tools/demo/record";
import { claude, codex, omp } from "../../tools/demo/sandbox";
import { writeProject } from "../../tools/demo/project";
import { shopApi } from "../shop-api";

const DECISION =
	"For the cart cache: use Redis, keep entries 60 seconds, and never cache carts of logged-in users. No code yet, just reply: Noted.";
const QUESTION = "What did I decide about the cart cache in my previous session here?";

export default {
	plugins: ["piebird-sessions"],
	agents: ["claude", "codex"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		await omp(s, "-p", DECISION);
		await claude(s, "-p", DECISION);
		await codex(s, "exec", DECISION);
	},
	async run(d) {
		d.caption("piebird-sessions", "agents read their past sessions");
		await d.wait(2000);
		await d.startOmp();
		d.caption("Yesterday's session settled the cart cache", "this is a new one");
		await d.prompt(QUESTION);
		d.caption("Found in the earlier session's journal", "read with session_read, not by grepping JSON");
		await d.wait(4000);
		await d.prompt("Quote my exact words from it, with the session and line.");
		d.caption("Your words, with where you said them", "so anyone can check them");
		await d.wait(4000);
		await d.newTab();
		await d.startAgent("claude");
		d.caption("Claude Code", "the same tool, on its own sessions");
		await d.prompt(QUESTION);
		await d.wait(4000);
		await d.newTab();
		await d.startAgent("codex");
		d.caption("Codex", "the same tool, on its own sessions");
		await d.prompt(QUESTION);
		await d.wait(4000);
		d.caption(
			"plugin install piebird-sessions@piebird",
			"omp, claude and codex · github.com/georgelubaretsi/piebird",
		);
		await d.wait(3000);
	},
} satisfies Scenario;
