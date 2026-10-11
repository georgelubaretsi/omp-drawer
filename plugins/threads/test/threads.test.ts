import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findThreadsFolder, type ThreadsFolder } from "../src/folder";
import { type BranchEntry, THREADS_TYPE, threadsMessage } from "../src/index";
import { renderThreads } from "../src/list";

const DAY = 24 * 60 * 60;
const NOW = Date.UTC(2026, 9, 10, 12) / 1000;

let project: string;
/** The project's private docs: their own git repository, named in .omp/threads.json. */
let notes: string;
let folder: ThreadsFolder;

beforeEach(() => {
	project = fs.mkdtempSync(path.join(os.tmpdir(), "threads-plugin-test-"));
	notes = path.join(project, "notes");
	fs.mkdirSync(path.join(notes, "threads", "done"), { recursive: true });
	git(notes, ["init", "-q"]);
	name("notes/threads");
	folder = { path: path.join(notes, "threads"), name: "notes/threads" };
});

afterEach(() => fs.rmSync(project, { recursive: true, force: true }));

function name(threads: string): void {
	fs.mkdirSync(path.join(project, ".omp"), { recursive: true });
	fs.writeFileSync(path.join(project, ".omp", "threads.json"), JSON.stringify({ folder: threads }));
}

// Git in `repo` with the user's config out of the way; `date` sets both commit dates.
function git(repo: string, args: string[], date?: string): void {
	const identity = {
		GIT_AUTHOR_NAME: "t",
		GIT_AUTHOR_EMAIL: "t@example.com",
		GIT_COMMITTER_NAME: "t",
		GIT_COMMITTER_EMAIL: "t@example.com",
	};
	const dates = date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
	const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...identity, ...dates };
	const result = spawnSync("git", ["-C", repo, ...args], { env });
	if (result.status !== 0) throw new Error(result.stderr.toString());
}

function thread(slug: string, fields: { next: string; area: string; questions?: number }, dir = folder.path): void {
	const questions = Array.from({ length: fields.questions ?? 0 }, (_, index) => `- question ${index}`);
	const text = [
		"---",
		`next: ${fields.next}`,
		`area: ${fields.area}`,
		"---",
		`# ${slug}`,
		"",
		"## Open questions for you",
		...questions,
		"## Decisions produced",
		"",
	];
	fs.writeFileSync(path.join(dir, `${slug}.md`), text.join("\n"));
}

/** Commits `paths` (everything by default) in `repo` as of `seconds` (Unix time). */
function commit(seconds: number, repo = notes, paths = ["-A"]): void {
	git(repo, ["add", ...paths]);
	git(repo, ["commit", "-q", "--no-verify", "-m", "threads"], `@${seconds} +0000`);
}

const updated = /updated \d\d-\d\d \d\d:\d\d/;

describe("the open-threads list", () => {
	test("lists threads waiting on you first, then the most recent, with next step and area", () => {
		thread("older", { next: "write the parser", area: "RFC 7 §2" });
		commit(NOW - 3 * DAY);
		thread("waiting", { next: "ask about the cache", area: "none", questions: 2 });
		commit(NOW - 2 * DAY);
		thread("fresh", { next: "run the tests", area: "notes" });
		const lines = renderThreads(folder, NOW).split("\n");
		expect(lines[0]).toBe("Open threads in notes/threads/ (3):");
		expect(lines[1]).toMatch(
			/^- waiting · waiting on you \(2 questions\) · updated \d\d-\d\d \d\d:\d\d · next: ask about the cache$/,
		);
		expect(lines[2]).toMatch(/^- fresh · updated .* \(uncommitted\) · next: run the tests · notes$/);
		expect(lines[3]).toMatch(/^- older · updated \d\d-\d\d \d\d:\d\d · next: write the parser · RFC 7 §2$/);
		expect(lines.every((line, index) => index === 0 || updated.test(line))).toBe(true);
	});

	test("counts threads untouched for ten days without listing them, and names unreadable files", () => {
		thread("stale", { next: "nothing", area: "none" });
		commit(NOW - 11 * DAY);
		expect(renderThreads(folder, NOW)).toBe("Open threads in notes/threads/ (0; 1 dormant not shown).");
		fs.writeFileSync(path.join(folder.path, "broken.md"), "# no front matter\n");
		fs.writeFileSync(path.join(folder.path, "no-area.md"), "---\nnext: start\n---\n# no area\n");
		expect(renderThreads(folder, NOW).split("\n")).toEqual([
			"Open threads in notes/threads/ (0; 1 dormant not shown):",
			"- unreadable: broken.md: no front matter",
			'- unreadable: no-area.md: no "area" in front matter',
		]);
	});

	test("reads quoted front matter values, and nothing when there are no threads or no folder yet", () => {
		expect(renderThreads(folder, NOW)).toBe("");
		expect(renderThreads({ path: path.join(project, "missing"), name: "missing" }, NOW)).toBe("");
		fs.writeFileSync(
			path.join(folder.path, "quoted.md"),
			"---\nnext: \"decide: A or B\"\narea: 'RFC 3 ''Layout'''\n---\n# q\n",
		);
		expect(renderThreads(folder, NOW)).toMatch(/· next: decide: A or B · RFC 3 'Layout'$/);
	});

	test("works for a folder inside the project's own repository, dating each thread by git", () => {
		git(project, ["init", "-q"]);
		const docs = path.join(project, "docs", "threads");
		fs.mkdirSync(docs, { recursive: true });
		thread("committed", { next: "ship it", area: "none" }, docs);
		commit(NOW - DAY, project, ["docs"]);
		thread("edited", { next: "review it", area: "none" }, docs);
		const lines = renderThreads({ path: docs, name: "docs/threads" }, NOW).split("\n");
		expect(lines[0]).toBe("Open threads in docs/threads/ (2):");
		expect(lines[1]).toMatch(/^- edited · updated .* \(uncommitted\) · next: review it$/);
		expect(lines[2]).toMatch(/^- committed · updated \d\d-\d\d \d\d:\d\d · next: ship it$/);
	});

	test("marks renamed and oddly named threads uncommitted, and reads CRLF files", () => {
		thread("old", { next: "rename me", area: "none" });
		commit(NOW - DAY);
		git(notes, ["mv", "threads/old.md", "threads/renamed.md"]);
		fs.writeFileSync(path.join(folder.path, "with space.md"), "---\nnext: a\narea: none\n---\n");
		fs.writeFileSync(path.join(folder.path, "crlf.md"), "---\r\nnext: b\r\narea: none\r\n---\r\n# c\r\n");
		const [header, ...threads] = renderThreads(folder, NOW).split("\n");
		expect(header).toBe("Open threads in notes/threads/ (3):");
		const lines = threads.toSorted();
		expect(lines[0]).toMatch(/^- crlf · updated .* \(uncommitted\) · next: b$/);
		expect(lines[1]).toMatch(/^- renamed · updated .* \(uncommitted\) · next: rename me$/);
		expect(lines[2]).toMatch(/^- with space · updated .* \(uncommitted\) · next: a$/);
	});

	test("keeps listing a thread with uncommitted changes, however old, so unsaved work stays in sight", () => {
		thread("unsaved", { next: "commit me", area: "none" });
		commit(NOW - 30 * DAY);
		thread("unsaved", { next: "commit me now", area: "none" });
		const old = new Date((NOW - 20 * DAY) * 1000);
		fs.utimesSync(path.join(folder.path, "unsaved.md"), old, old);
		expect(renderThreads(folder, NOW)).toMatch(/^- unsaved · updated .* \(uncommitted\) · next: commit me now$/m);
	});
});

describe("the threads folder", () => {
	test("is the one .omp/threads.json names, found from the project or any folder below it", () => {
		fs.mkdirSync(path.join(project, "src", "deep"), { recursive: true });
		expect(findThreadsFolder(path.join(project, "src", "deep"))).toEqual(folder);
		name("notes/threads/");
		expect(findThreadsFolder(project)).toEqual(folder);
	});

	test("is never guessed: without .omp/threads.json a project has none, and a file naming none fails", () => {
		fs.rmSync(path.join(project, ".omp"), { recursive: true });
		fs.mkdirSync(path.join(project, "library", "threads"), { recursive: true });
		expect(findThreadsFolder(project)).toBeUndefined();
		fs.mkdirSync(path.join(project, ".omp"));
		fs.writeFileSync(path.join(project, ".omp", "threads.json"), "{}");
		expect(() => findThreadsFolder(project)).toThrow('names no "folder"');
	});
});

const sent = (content: string): BranchEntry => ({ type: "custom_message", customType: THREADS_TYPE, content });
const context = (branch: BranchEntry[] = [], kind: "main" | "sub" = "main") => ({
	agent: { kind },
	cwd: project,
	sessionManager: { getBranch: () => branch },
});

describe("the threads message", () => {
	test("is sent when the list changed, and again after a compaction", () => {
		thread("one", { next: "start", area: "none" });
		const list = threadsMessage(context());
		expect(list).toStartWith("Open threads in notes/threads/ (1):");
		expect(threadsMessage(context([sent(list ?? "")]))).toBeUndefined();
		expect(threadsMessage(context([sent(list ?? ""), { type: "compaction" }]))).toBe(list);
	});

	test("says there are no open threads once the last one closes, once", () => {
		const none = "No open threads in notes/threads/.";
		expect(threadsMessage(context())).toBeUndefined();
		expect(threadsMessage(context([sent("Open threads in notes/threads/ (1):\n- one")]))).toBe(none);
		expect(threadsMessage(context([sent(none)]))).toBeUndefined();
	});

	test("says once that earlier lists no longer apply when nothing names a threads folder any more", () => {
		const gone = "No threads folder here: no .omp/threads.json names one, so earlier thread lists no longer apply.";
		fs.rmSync(path.join(project, ".omp"), { recursive: true });
		expect(threadsMessage(context([sent("Open threads in notes/threads/ (1):\n- one")]))).toBe(gone);
		expect(threadsMessage(context([sent(gone)]))).toBeUndefined();
	});

	test("is not sent to subagents, nor outside a project that names a threads folder", () => {
		thread("one", { next: "start", area: "none" });
		expect(threadsMessage(context([], "sub"))).toBeUndefined();
		expect(threadsMessage({ ...context(), cwd: os.tmpdir() })).toBeUndefined();
	});
});
