// piebird-agent-variants: a project already has a temporary reviewer on Claude Haiku, made in an
// earlier session and committed. A new session lists it; asked for the same reviewer on Sonnet,
// omp replaces its own variant, which it does only when asked.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { omp } from "../../../tools/demo/sandbox";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

export default {
	plugins: ["piebird-agent-variants"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		// Claude through the demo machine's gateway counts as a key; on this Mac it is a subscription.
		await omp(
			s,
			"-p",
			"Set up a temporary variant of the reviewer agent on Claude Haiku with agent_variant_setup. Claude is my subscription, and project writes are approved. Don't run it.",
		);
		Bun.spawnSync(["git", "add", ".omp"], { cwd: s.project });
		Bun.spawnSync(["git", "commit", "-qm", "A temporary reviewer on Haiku"], { cwd: s.project });
	},
	async run(d) {
		await intro(d, "piebird-agent-variants", "temporary agents, kept in view");
		d.caption("A new session lists the project's temporary agents", "made by an earlier session");
		await d.wait(5000);
		await d.prompt("Make that temporary reviewer run on Claude Sonnet instead; Claude is my subscription.", {
			fast: 3,
		});
		d.caption("It replaces its own variant only when you ask", "never an agent or role it didn't make");
		await d.wait(5000);
		await outro(d, "piebird-agent-variants");
	},
} satisfies Scenario;
