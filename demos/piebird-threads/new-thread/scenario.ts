// piebird-threads: the project names its threads folder in .agents/piebird/settings.json and has
// no thread yet. The user parks a piece of work; omp reads the threads skill and writes a thread
// for it, and the list in front of omp shows it from then on.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { outro } from "../../feature";
import { shopApi } from "../../shop-api";

const SETTINGS = `{ "piebird-threads": { "folder": "threads" } }\n`;

export default {
	plugins: ["piebird-threads"],
	projectName: "shop-api",
	async setup(s) {
		const files = { ".agents/piebird/settings.json": SETTINGS, "threads/.gitkeep": "" };
		await writeProject(s.project, { ...shopApi, ...files }, "Cart, shipping and a threads folder");
	},
	async run(d) {
		d.caption("piebird-threads", "a thread for work you park");
		await d.wait(2000);
		d.caption("The project names its threads folder", ".agents/piebird/settings.json");
		await d.type("cat .agents/piebird/settings.json");
		await d.key("Enter");
		await d.wait(3000);
		await d.startOmp();
		await d.prompt(
			"Let's park coupons for now. Decided so far: at most two coupons per order. Still open for me: can a coupon apply to shipping? Keep a thread so we pick it up later.",
			{ fast: 3 },
		);
		d.caption("omp wrote a thread", "the next step, and the question waiting on you");
		await d.wait(4000);
		await d.prompt("What's waiting on me?");
		d.caption("The list in front of omp has it now", "sent again whenever it changes");
		await d.wait(4000);
		await outro(d, "piebird-threads");
	},
} satisfies Scenario;
