// piebird-agent-variants: the project's .omp/config.yml has a change not yet committed. Asked for a
// reviewer on Haiku, omp refuses to write over it; once the change is committed, it sets the
// variant up.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

export default {
	plugins: ["piebird-agent-variants"],
	projectName: "shop-api",
	async setup(s) {
		await mkdir(join(s.project, ".omp"), { recursive: true });
		await writeFile(
			join(s.project, ".omp", "config.yml"),
			"modelRoles:\n  default: anthropic/claude-haiku-5-5:low\n",
		);
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		// Someone's edit, not committed yet.
		await appendFile(join(s.project, ".omp", "config.yml"), "  smol: anthropic/claude-haiku-5-5:low\n");
	},
	async run(d) {
		await intro(d, "piebird-agent-variants", "never over your own changes");
		d.caption(".omp/config.yml has a change not committed");
		// Claude through the demo machine's gateway counts as a key; on this Mac it is a subscription.
		await d.prompt("Have the reviewer agent check src/cart.ts, running on Claude Haiku, my Claude subscription.", {
			fast: 3,
		});
		d.caption("omp won't write over it", "and says why");
		await d.wait(4000);
		await d.prompt("That change is mine and it's good: commit .omp/config.yml as 'smol role', then try again.", {
			fast: 4,
			timeoutMs: 300_000,
		});
		d.caption("Committed, the variant is set up", "a temporary reviewer on Haiku, then the review");
		await d.wait(5000);
		await outro(d, "piebird-agent-variants");
	},
} satisfies Scenario;
