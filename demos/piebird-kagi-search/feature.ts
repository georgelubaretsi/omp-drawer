// What piebird-kagi-search's feature demos share: omp alone, in the made-up shop project, with the
// Kagi session the recorder is given (KAGI_SESSION_TOKEN), one or two prompts with their captions.
import type { Scenario } from "../../tools/demo/record";
import type { Sandbox } from "../../tools/demo/sandbox";
import { writeProject } from "../../tools/demo/project";
import { intro, outro } from "../feature";
import { shopApi } from "../shop-api";

export interface Step {
	readonly prompt: string;
	readonly caption: string;
	readonly sub?: string;
}

/** A Kagi feature demo: its title card's line, the steps, and anything its setup adds. */
export function kagiDemo(sub: string, steps: readonly Step[], extra?: (s: Sandbox) => Promise<void>): Scenario {
	return {
		plugins: ["piebird-kagi-search"],
		credentials: ["kagi"],
		projectName: "shop-api",
		async setup(s) {
			await writeProject(s.project, shopApi, "Cart and shipping totals");
			await extra?.(s);
		},
		async run(d) {
			await intro(d, "piebird-kagi-search", sub);
			for (const step of steps) {
				await d.prompt(step.prompt, { fast: 4 });
				d.caption(step.caption, step.sub);
				await d.wait(5000);
			}
			await outro(d, "piebird-kagi-search");
		},
	};
}
