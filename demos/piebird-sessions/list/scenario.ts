// piebird-sessions: two earlier sessions in the project. Asked what came before, omp lists the
// project's sessions, newest first, each with its title and first prompt; and it knows the id of
// the session it is in, which the plugin tells it at the start.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { omp } from "../../../tools/demo/sandbox";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

export default {
	plugins: ["piebird-sessions"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		await omp(s, "-p", "Shipping coupons: they should never make shipping negative. Just reply: Noted.");
		await omp(s, "-p", "For refunds, we refund the gift card first, then the card. Just reply: Noted.");
	},
	async run(d) {
		await intro(d, "piebird-sessions", "every session of this project, at hand");
		d.caption("Which sessions came before?");
		await d.prompt("Which sessions have I had in this project before this one?");
		d.caption("The project's sessions, newest first", "each with its title and first prompt");
		await d.wait(5000);
		await d.prompt("And what's the id of this session?");
		d.caption("omp knows the session it is in", "so it can cite where you said something");
		await d.wait(4000);
		await outro(d, "piebird-sessions");
	},
} satisfies Scenario;
