// piebird-kagi-search: the "Search with Kagi" setting at `only`, in the person's settings file.
// omp's own web_search is gone and the instructions say Kagi only: a search goes to Kagi.
import type { Scenario } from "../../../tools/demo/record";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeProject } from "../../../tools/demo/project";
import { outro } from "../../feature";
import { shopApi } from "../../shop-api";

const SETTINGS = `{ "piebird-kagi-search": { "search": "only" } }\n`;

export default {
	plugins: ["piebird-kagi-search"],
	credentials: ["kagi"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		await mkdir(join(s.home, ".agents", "piebird"), { recursive: true });
		await writeFile(join(s.home, ".agents", "piebird", "settings.json"), SETTINGS);
	},
	async run(d) {
		d.caption("piebird-kagi-search", "your choice: Kagi only, Kagi first, or offered");
		await d.wait(2000);
		d.caption("Your settings, for every agent", "~/.agents/piebird/settings.json");
		await d.type("cat ~/.agents/piebird/settings.json");
		await d.key("Enter");
		await d.wait(3000);
		await d.startOmp();
		await d.prompt("Find the release date of the latest TypeScript version.", { fast: 4 });
		d.caption("Kagi only: omp's own web search is gone", "every search goes through your Kagi account");
		await d.wait(5000);
		await outro(d, "piebird-kagi-search");
	},
} satisfies Scenario;
