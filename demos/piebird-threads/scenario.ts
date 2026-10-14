// piebird-threads' demo: a project with two threads, one waiting on the user. omp sees the open
// threads before the first prompt, records the user's answer in the thread, and the list follows;
// then Claude Code and Codex, a tab each, find the same threads.
import type { Scenario } from "../../tools/demo/record";
import { writeProject } from "../../tools/demo/project";
import { shopApi } from "../shop-api";

const CHECKOUT = `---
next: decide how to round percentage discounts
area: src/cart.ts
---
# Checkout totals

Totals are off by a cent when a percentage discount applies: the discount isn't rounded.

## Open questions for you

- Round discounts down, or to the nearest cent?
`;

const CACHE = `---
next: measure the cart cache's hit rate in staging
area: none
---
# Cart cache

Redis, 60 seconds, never for logged-in users. Deployed to staging; no numbers yet.
`;

export default {
	plugins: ["piebird-threads"],
	agents: ["claude", "codex"],
	projectName: "shop-api",
	async setup(s) {
		const threads = {
			".omp/threads.json": '{ "folder": "threads" }\n',
			"threads/checkout-totals.md": CHECKOUT,
			"threads/cart-cache.md": CACHE,
		};
		await writeProject(s.project, { ...shopApi, ...threads }, "Cart, shipping and two threads");
	},
	async run(d) {
		d.caption("piebird-threads", "open lines of work, in front of omp, Claude Code and Codex");
		await d.wait(2000);
		await d.startOmp();
		await d.prompt("What's waiting on me?");
		d.caption("omp sees the open threads before your prompt", "and which ones wait on you");
		await d.wait(4500);
		await d.prompt("Round to the nearest cent. Record that in the thread.");
		d.caption("Your answer goes into the thread", "so the next session knows");
		await d.wait(3500);
		await d.prompt("Anything else waiting on me?");
		d.caption("The list follows the files", "sent again only when it changes");
		await d.wait(4000);
		await d.newTab();
		await d.startAgent("claude");
		d.caption("Claude Code", "the same threads, listed at the start of its session");
		await d.prompt("What's waiting on me?");
		await d.wait(4000);
		await d.newTab();
		await d.startAgent("codex");
		d.caption("Codex", "the same threads, with the threads skill");
		await d.prompt("What's waiting on me? Check the project's threads.");
		await d.wait(4000);
		d.caption("plugin install piebird-threads@piebird", "omp, claude and codex · github.com/georgelubaretsi/piebird");
		await d.wait(3000);
	},
} satisfies Scenario;
