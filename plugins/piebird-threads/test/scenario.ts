// The scripted session behind piebird-threads's "what the model sees" page (tools/model-page.ts):
// a project whose settings name its threads folder in its own repository, with a thread waiting on
// the user, a recent one, one with unsaved changes and a dormant one, at a fixed time.
import type { Scenario, Setup, Step } from "../../../tools/model-page/types";
import { spawnSync } from "node:child_process";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import threads from "../src/index";
import { register } from "../com.anthropic.claudecode/hooks/register";
import { traceMessages } from "../kit/core/model";

const NOW = "2026-10-12T09:00:00Z";

function git(repo: string, args: string[], date?: string): void {
	const identity = { GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "ada@example.com" };
	const committer = { GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "ada@example.com" };
	const dates = date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
	const run = spawnSync("git", ["-C", repo, ...args], {
		env: { ...process.env, ...identity, ...committer, ...dates },
	});
	if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
}

async function thread(folder: string, slug: string, front: { next: string; area: string }, questions: string[] = []) {
	const lines = ["---", `next: ${front.next}`, `area: ${front.area}`, "---", `# ${slug}`, ""];
	const asked = questions.length === 0 ? [] : ["## Open questions for you", ...questions.map(q => `- ${q}`), ""];
	await writeFile(join(folder, `${slug}.md`), [...lines, ...asked].join("\n"));
}

async function setup(home: string): Promise<Setup> {
	const project = join(home, "shop-api");
	const folder = join(project, "docs", "threads");
	await mkdir(join(project, ".agents", "piebird"), { recursive: true });
	await mkdir(join(folder, "done"), { recursive: true });
	const settings = { "piebird-threads": { folder: "docs/threads" } };
	await writeFile(join(project, ".agents", "piebird", "settings.json"), JSON.stringify(settings));
	git(project, ["init", "-q"]);
	const commit = (date: string) => {
		git(project, ["add", "-A"]);
		git(project, ["commit", "-q", "--no-verify", "-m", "threads"], date);
	};
	await thread(folder, "search-rewrite", { next: "pick a tokenizer", area: "none" });
	commit("2026-09-20T10:00:00Z");
	await thread(folder, "cache-ttl", { next: "measure the hit rate with a 5-minute TTL", area: "none" });
	commit("2026-10-09T16:20:00Z");
	const asked = ["Round tax per line or per order?"];
	await thread(
		folder,
		"checkout-totals",
		{ next: "fix rounding in the tax step", area: "docs/design/checkout.md" },
		asked,
	);
	commit("2026-10-11T09:12:00Z");
	await thread(folder, "rate-limits", { next: "write the limiter's tests", area: "none" });
	const edited = new Date("2026-10-12T08:30:00Z");
	await utimes(join(folder, "rate-limits.md"), edited, edited);
	const session = (id: string) => ({ id, file: join(home, "sessions", `${id}.jsonl`) });
	return { project, now: NOW, sessions: { omp: session("omp"), claude: session("claude"), codex: session("codex") } };
}

const STEPS: readonly Step[] = [{ kind: "start", title: "The session starts" }];

export const scenario: Scenario = {
	plugin: "piebird-threads",
	setup,
	steps: STEPS,
	traceMessages,
	shells: { omp: threads, claude: register },
};
