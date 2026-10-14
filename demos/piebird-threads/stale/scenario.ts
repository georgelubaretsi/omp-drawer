// piebird-threads: two threads, one last touched twelve days ago. The list in front of omp leaves
// the old one out: a thread untouched for 10 days drops out until it changes.
import type { Scenario } from "../../../tools/demo/record";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro } from "../../feature";
import { shopApi } from "../../shop-api";

const REFUNDS = `---
next: write the refund endpoint
area: src/server.ts
---
# Refunds

Gift card first, then the card, never more than was paid.
`;

const SEARCH = `---
next: pick a search engine for products
area: none
---
# Product search

Postgres full-text or Meilisearch; nobody has looked yet.
`;

/** Commits `file` as if twelve days ago. */
function commitOld(project: string, file: string): void {
	const old = new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString();
	const env = { ...process.env, GIT_AUTHOR_DATE: old, GIT_COMMITTER_DATE: old };
	Bun.spawnSync(["git", "add", file], { cwd: project });
	Bun.spawnSync(["git", "commit", "-qm", "Product search thread"], { cwd: project, env });
}

export default {
	plugins: ["piebird-threads"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(
			s.project,
			{ ...shopApi, ".omp/threads.json": '{ "folder": "threads" }\n' },
			"Cart and shipping",
		);
		await mkdir(join(s.project, "threads"), { recursive: true });
		await writeFile(join(s.project, "threads", "product-search.md"), SEARCH);
		commitOld(s.project, "threads/product-search.md");
		await writeFile(join(s.project, "threads", "refunds.md"), REFUNDS);
		Bun.spawnSync(["git", "add", "threads/refunds.md"], { cwd: s.project });
		Bun.spawnSync(["git", "commit", "-qm", "Refunds thread"], { cwd: s.project });
	},
	async run(d) {
		await intro(d, "piebird-threads", "only the threads still moving");
		await d.prompt("Which threads are open?");
		d.caption("Refunds, touched today, is listed", "product search, untouched for 12 days, is left out");
		await d.wait(5000);
		d.caption("Edit it, and it's back on the list");
		await d.wait(3000);
		await outro(d, "piebird-threads");
	},
} satisfies Scenario;
