// piebird-workflow-rules: omp's reviewer agent, with the proportion-review rule, reviews the cart:
// findings weighed by how likely they are and what they cost, the unlikely and minor ones in a line.
// omp runs the reviewer as a background job and relays its findings once it is done.
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
		await intro(d, "piebird-workflow-rules", "reviews in proportion");
		await d.prompt("Have the reviewer agent review src/cart.ts.", { fast: 4, timeoutMs: 300_000 });
		d.caption("The reviewer works in the background");
		d.speed(4);
		// omp's toast when the job is done, then its turn relaying the findings.
		await d.waitFor("Background task", 300_000);
		await d.idle();
		d.speed(1);
		d.caption("Findings weighed: how likely, how bad, what a fix costs", "the unlikely and minor ones in one line");
		await d.wait(6000);
		await outro(d, "piebird-workflow-rules");
	},
} satisfies Scenario;
