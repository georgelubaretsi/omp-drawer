// piebird-threads: a thread waits on the user's answer. The user answers; omp does the work and,
// the thread finished, moves it to threads/done/, and the list in front of omp drops it.
import type { Scenario } from "../../../tools/demo/record";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

const SHIPPING = `---
next: decide whether shipping may go below zero
area: src/cart.ts
---
# Shipping coupons

A coupon bigger than the shipping cost makes shipping negative.

## Open questions for you

- Should shipping stop at zero, or may a coupon credit the rest?
`;

export default {
	plugins: ["piebird-threads"],
	projectName: "shop-api",
	async setup(s) {
		const threads = { ".omp/threads.json": '{ "folder": "threads" }\n', "threads/shipping-coupons.md": SHIPPING };
		await writeProject(s.project, { ...shopApi, ...threads }, "Cart, shipping and a thread");
	},
	async run(d) {
		await intro(d, "piebird-threads", "a finished thread leaves the list");
		await d.prompt(
			"Shipping stops at zero. Make it so, with a test, and since that settles the shipping coupons thread, close it.",
			{
				fast: 4,
				timeoutMs: 300_000,
			},
		);
		d.caption("Done: fixed, tested, and the thread moved to threads/done/");
		await d.wait(4000);
		await d.prompt("Anything still waiting on me?");
		d.caption("The list follows the folder", "finished threads stay in done/, out of the way");
		await d.wait(4000);
		await outro(d, "piebird-threads");
	},
} satisfies Scenario;
