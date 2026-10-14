// piebird-tern-ghostty-style's demo: a turn of omp in Tern's own look; then, with the plugin installed,
// the same session continued: omp sets up the look in Tern by itself and the turn redraws.
import type { Scenario } from "../../tools/demo/record";
import { writeProject } from "../../tools/demo/project";
import { linkPlugin } from "../../tools/demo/sandbox";
import { shopApi } from "../shop-api";

export default {
	plugins: [],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
	},
	async run(d) {
		d.caption("piebird-tern-ghostty-style", "omp in Tern, drawn the way it looks in Ghostty");
		await d.wait(2000);
		await d.startOmp();
		d.caption("Tern's own look");
		await d.prompt("Run bun test, then make shipping() in src/cart.ts never return less than zero.", { fast: 4 });
		await d.wait(3500);
		await d.key("ctrl+c");
		await d.wait(300);
		await d.key("ctrl+c");
		await d.wait(1500);
		await linkPlugin(d.sandbox, "piebird-tern-ghostty-style");
		d.caption("Install the plugin, continue the session", "omp plugin install piebird-tern-ghostty-style@piebird");
		await d.wait(2500);
		// A continued session's composer shows its title, not omp's greeting: wait for the turn instead.
		await d.startOmp("omp -c", "never return less than zero");
		d.caption("omp sets up the look in Tern by itself", "one box per tool call, $ commands, compact diffs");
		await d.wait(7000);
		d.caption("omp plugin install piebird-tern-ghostty-style@piebird", "github.com/georgelubaretsi/piebird");
		await d.wait(3000);
	},
} satisfies Scenario;
