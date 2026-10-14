// piebird-tern-bridge: asked in plain words, omp splits a pane below its own and runs the project's
// tests there, keeping the focus where the person types; then closes the pane it opened.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

export default {
	plugins: ["piebird-tern-bridge"],
	projectName: "shop-api",
	size: [540, 640],
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
	},
	async run(d) {
		await intro(d, "piebird-tern-bridge", "panes, as you ask for them");
		await d.wait(2500);
		await d.prompt("Split a pane below this one and run bun test there. Keep the focus here.");
		d.caption("A pane below, running the tests", "the focus stays where you type");
		await d.wait(5000);
		await d.prompt("Close the test pane you opened.");
		d.caption("It closes only what it opened");
		await d.wait(3000);
		await outro(d, "piebird-tern-bridge");
	},
} satisfies Scenario;
