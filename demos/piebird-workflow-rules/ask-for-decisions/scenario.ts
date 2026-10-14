// piebird-workflow-rules: a request with a real choice in it, which has no safe default: carts that
// survive a restart, on several servers next month, so a file on one server won't do and the store
// to run is the user's call. The ask-for-decisions rule has omp find out the rest by itself first,
// then ask only what is left, with what each option gives and takes: in its reply, or with the ask
// tool for a final pick, where the user takes the recommended option. A plan, not the code: the
// demo ends at the question.
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
		await intro(d, "piebird-workflow-rules", "asks only what you must decide");
		d.caption("A request with a real choice in it", "the store to run is yours to pick");
		await d.prompt(
			"Carts must survive a server restart, and next month we run several servers behind a load balancer. Plan it with me before any code.",
			{
				fast: 3,
				timeoutMs: 300_000,
				// Each question of the ask, then its review: the ask's footer offers Skip until it closes.
				answer: {
					when: "Recommended",
					keys: [["Enter", "Enter: the recommended option"]],
					open: "Skip",
					optional: true,
				},
			},
		);
		d.caption("It looked first, then asked only what it couldn't find out", "with what each option gives and takes");
		await d.wait(6000);
		await outro(d, "piebird-workflow-rules");
	},
} satisfies Scenario;
