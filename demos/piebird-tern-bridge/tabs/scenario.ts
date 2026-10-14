// piebird-tern-bridge: omp opens a file in a tab of its own, names the tab, and comes back to the
// tab it runs in.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

export default {
	plugins: ["piebird-tern-bridge"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
	},
	async run(d) {
		await intro(d, "piebird-tern-bridge", "tabs, as you ask for them");
		await d.wait(2500);
		await d.prompt("Open src/cart.ts in a new tab, name that tab cart, then show this tab again.");
		d.caption("A new tab named cart, with the file", "and back in the tab you type in");
		await d.wait(5000);
		await outro(d, "piebird-tern-bridge");
	},
} satisfies Scenario;
