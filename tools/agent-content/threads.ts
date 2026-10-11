// The threads plugin's outputs for templates/threads.md: its message, from a made-up project that
// keeps private docs in `notes/` (its own git repository) and names `notes/threads` in
// `.omp/threads.json`, with two threads committed this week (one with open questions), one with
// uncommitted changes, one untouched for 20 days and a file without front matter; then the lines
// that replace a list, and the rules and skills it ships. Every date is fixed, so the output
// doesn't depend on when it runs.
import { spawnSync } from "node:child_process";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findThreadsFolder } from "../../plugins/threads/src/folder";
import { renderThreads } from "../../plugins/threads/src/list";
import { templates } from "../../plugins/threads/src/templates";
import type { Doc } from "./doc";
import { rulesSection, skillsSection } from "./shipped";

/** "Now" for the sample, in Unix seconds. */
const NOW = Math.floor(Date.UTC(2026, 9, 11, 9) / 1000);
const DAY = 24 * 60 * 60;

function git(library: string, args: string[], seconds?: number): void {
	const dates =
		seconds === undefined ? {} : { GIT_AUTHOR_DATE: `@${seconds} +0000`, GIT_COMMITTER_DATE: `@${seconds} +0000` };
	const env = {
		...process.env,
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_AUTHOR_NAME: "sample",
		GIT_AUTHOR_EMAIL: "sample@example.com",
		GIT_COMMITTER_NAME: "sample",
		GIT_COMMITTER_EMAIL: "sample@example.com",
		...dates,
	};
	const result = spawnSync("git", ["-C", library, ...args], { env, encoding: "utf8" });
	if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr || result.error?.message}`);
}

function writeThread(
	library: string,
	slug: string,
	fields: { next: string; area: string; questions?: string[] },
): string {
	const file = path.join(library, "threads", `${slug}.md`);
	const questions = (fields.questions ?? []).map(question => `- ${question}`);
	const text = [
		"---",
		`next: ${fields.next}`,
		`area: ${fields.area}`,
		"---",
		`# ${slug}`,
		"",
		"## Open questions for you",
		...questions,
		"",
		"## Decisions produced",
		"",
	];
	writeFileSync(file, text.join("\n"));
	return file;
}

function commitAll(library: string, daysAgo: number): void {
	git(library, ["add", "-A"]);
	git(library, ["commit", "-q", "--no-verify", "-m", "threads"], NOW - daysAgo * DAY);
}

function writeLibrary(library: string): void {
	mkdirSync(path.join(library, "threads", "done"), { recursive: true });
	git(library, ["init", "-q"]);
	writeThread(library, "old-search", { next: "rewrite the search index", area: "none" });
	commitAll(library, 20);
	writeThread(library, "checkout-totals", {
		next: "decide how to round discounts",
		area: "none",
		questions: ["Round per line or per order?", "Show the rounding on the receipt?"],
	});
	commitAll(library, 2);
	writeThread(library, "response-cache", { next: "measure the hit rate in staging", area: "RFC 4 §3" });
	commitAll(library, 1);
	const uncommitted = writeThread(library, "image-uploads", {
		next: "pick a storage bucket",
		area: "notes/uploads.md",
		questions: ["Keep originals, or only resized copies?"],
	});
	// An uncommitted thread is dated by its file's time.
	const edited = NOW - 3 * 60 * 60;
	utimesSync(uncommitted, edited, edited);
	writeFileSync(path.join(library, "threads", "draft.md"), "# draft\n\nno front matter yet\n");
}

/** The values for templates/threads.md; `project` is an empty folder, `plugin` the plugin's folder. */
export function threadsValues(doc: Doc, project: string, plugin: string): Record<string, unknown> {
	writeLibrary(path.join(project, "notes"));
	mkdirSync(path.join(project, ".omp"));
	writeFileSync(path.join(project, ".omp", "threads.json"), JSON.stringify({ folder: "notes/threads" }));
	const folder = findThreadsFolder(project);
	if (folder === undefined) throw new Error("the sample project names no threads folder");
	return {
		openThreads: doc.quote(renderThreads(folder, NOW)),
		none: doc.quote(templates.none.render({ folder: folder.name })),
		noFolder: doc.quote(templates.noFolder.render()),
		rules: rulesSection(doc, plugin),
		skills: skillsSection(doc, plugin),
	};
}
