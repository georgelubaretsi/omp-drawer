// piebird-workflow-rules: the failure-classes skill. Before a release, omp checks the cart against
// the skill's general failure classes and names what it finds by class.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

export default {
	plugins: ["piebird-workflow-rules"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
	},
	async run(d) {
		await intro(d, "piebird-workflow-rules", "the failure-classes skill");
		await d.prompt("Before we release, check src/cart.ts against the failure classes. Report, don't fix.", {
			fast: 4,
			timeoutMs: 240_000,
		});
		d.caption("Ten general classes of failure", "inputs, state, time, concurrency, trust and more");
		await d.wait(6000);
		await outro(d, "piebird-workflow-rules");
	},
} satisfies Scenario;
