// piebird-workflow-rules: the project-tooling rule. The project has its own check script; asked to
// check the work, omp runs the project's command rather than tools of its own choosing.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

const PACKAGE = `{
  "name": "shop-api",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "bun test && bunx --bun tsc --noEmit --strict --types bun src/*.ts"
  }
}
`;

export default {
	plugins: ["piebird-workflow-rules"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, { ...shopApi, "package.json": PACKAGE }, "Cart, shipping and a check script");
	},
	async run(d) {
		await intro(d, "piebird-workflow-rules", "the project's own tools");
		await d.prompt("Check the project before I push.", { fast: 3, timeoutMs: 240_000 });
		d.caption("The project's own check, as its package.json says", "not a guess at which tools to run");
		await d.wait(5000);
		await outro(d, "piebird-workflow-rules");
	},
} satisfies Scenario;
