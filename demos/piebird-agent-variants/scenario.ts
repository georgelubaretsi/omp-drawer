// piebird-agent-variants' demo: the user asks for a review by a reviewer on another model; omp sets
// up a temporary variant of its reviewer agent on that model and hands it the review.
import type { Scenario } from "../../tools/demo/record";
import { writeProject } from "../../tools/demo/project";
import { shopApi } from "../shop-api";

export default {
	plugins: ["piebird-agent-variants"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
	},
	async run(d) {
		d.caption("piebird-agent-variants", "any omp agent, on the model you name");
		await d.wait(2000);
		await d.startOmp();
		d.caption("Name the agent and the model", "in plain words");
		await d.prompt("Have the reviewer agent check src/cart.ts, running on Claude Haiku.", {
			fast: 4,
			timeoutMs: 300_000,
		});
		d.caption("omp made a temporary reviewer on Haiku", "and handed it the review");
		await d.wait(5000);
		d.caption("omp plugin install piebird-agent-variants@piebird", "github.com/georgelubaretsi/piebird");
		await d.wait(3000);
	},
} satisfies Scenario;
