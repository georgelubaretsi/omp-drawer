// piebird-tern-bridge's demo: omp, started in Tern, installs the plugin's Tern part by itself, then
// works the window it runs in when asked in plain words: a file beside it, a Tern agent in a pane.
import type { Scenario } from "../../tools/demo/record";
import { writeProject } from "../../tools/demo/project";
import { shopApi } from "../shop-api";

export default {
	plugins: ["piebird-tern-bridge"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
	},
	async run(d) {
		d.caption("piebird-tern-bridge", "omp works the Tern window it runs in");
		await d.wait(2000);
		await d.startOmp();
		d.caption("omp sets up the plugin's Tern part", "on its first start in Tern, by itself");
		await d.wait(3500);
		d.caption("Ask in plain words");
		await d.prompt("Open README.md beside this pane, keep focus here");
		d.caption("Files open beside you", "and the focus stays in omp");
		await d.wait(3000);
		await d.prompt("Close the README pane");
		d.caption("Tern agents too", "omp, Claude Code or Codex in panes you can watch");
		await d.prompt(
			"Start a Tern agent beside me and ask it which files are in src. Wait for it, then tell me its answer.",
			{
				timeoutMs: 240_000,
			},
		);
		d.caption("omp started it, waited, and read its answer");
		await d.wait(4000);
		d.caption("omp plugin install piebird-tern-bridge@piebird", "github.com/georgelubaretsi/piebird");
		await d.wait(3000);
	},
} satisfies Scenario;
