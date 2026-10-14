import type { ThreadsFolder } from "../core/folder";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { threadsFolder } from "../core/folder";
import { threadsList } from "../core/list";
import { ruleText, threadsUpdate } from "../core/update";
import { bunIo } from "../kit/bun/io";
import { lastSent, THREADS_TYPE } from "../src/index";

const DAY = 24 * 60 * 60;
const NOW = Date.UTC(2026, 9, 10, 12) / 1000;
const io = bunIo();

let home: string;
let project: string;
/** The project's private docs: their own git repository, named in .omp/threads.json. */
let notes: string;
let folder: ThreadsFolder;

beforeEach(() => {
	home = fs.mkdtempSync(path.join(os.tmpdir(), "threads-plugin-test-"));
	project = path.join(home, "shop-api");
	notes = path.join(project, "notes");
	fs.mkdirSync(path.join(notes, "threads", "done"), { recursive: true });
	git(notes, ["init", "-q"]);
	name("notes/threads");
	folder = { path: path.join(notes, "threads"), name: "notes/threads" };
});

afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

function name(threads: string): void {
	fs.mkdirSync(path.join(project, ".omp"), { recursive: true });
	fs.writeFileSync(path.join(project, ".omp", "threads.json"), JSON.stringify({ folder: threads }));
}

/** Writes the plugin's section of a settings file under `base` (the project or the home folder). */
function setting(base: string, value: string): void {
	fs.mkdirSync(path.join(base, ".agents", "piebird"), { recursive: true });
	const file = path.join(base, ".agents", "piebird", "settings.json");
	fs.writeFileSync(file, JSON.stringify({ "piebird-threads": { folder: value } }));
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

const listOf = async (of: ThreadsFolder) => (await threadsList(io, of, NOW))?.text ?? "";
const place = (cwd = project) => ({ home, project: cwd, plugin: "/plugin" });
const updated = /updated \d\d-\d\d \d\d:\d\d/;

describe("the open-threads list", () => {
	test("lists threads waiting on you first, then the most recent, with next step and area", async () => {
		thread("older", { next: "write the parser", area: "RFC 7 §2" });
		commit(NOW - 3 * DAY);
		thread("waiting", { next: "ask about the cache", area: "none", questions: 2 });
		commit(NOW - 2 * DAY);
		thread("fresh", { next: "run the tests", area: "notes" });
		const lines = (await listOf(folder)).split("\n");
		expect(lines[0]).toBe("Open threads in notes/threads/ (3):");
		expect(lines[1]).toMatch(
			/^- waiting · waiting on you \(2 questions\) · updated \d\d-\d\d \d\d:\d\d · next: ask about the cache$/,
		);
		expect(lines[2]).toMatch(/^- fresh · updated .* \(uncommitted\) · next: run the tests · notes$/);
		expect(lines[3]).toMatch(/^- older · updated \d\d-\d\d \d\d:\d\d · next: write the parser · RFC 7 §2$/);
		expect(lines.every((line, index) => index === 0 || updated.test(line))).toBe(true);
	});

	test("counts threads untouched for ten days without listing them, and names unreadable files", async () => {
		thread("stale", { next: "nothing", area: "none" });
		commit(NOW - 11 * DAY);
		expect(await listOf(folder)).toBe("Open threads in notes/threads/ (0; 1 dormant not shown).");
		fs.writeFileSync(path.join(folder.path, "broken.md"), "# no front matter\n");
		fs.writeFileSync(path.join(folder.path, "no-area.md"), "---\nnext: start\n---\n# no area\n");
		expect((await listOf(folder)).split("\n")).toEqual([
			"Open threads in notes/threads/ (0; 1 dormant not shown):",
			"- unreadable: broken.md: no front matter",
			'- unreadable: no-area.md: no "area" in front matter',
		]);
	});

	test("reads quoted front matter values, and nothing when there are no threads or no folder yet", async () => {
		expect(await listOf(folder)).toBe("");
		expect(await listOf({ path: path.join(project, "missing"), name: "missing" })).toBe("");
		fs.writeFileSync(
			path.join(folder.path, "quoted.md"),
			"---\nnext: \"decide: A or B\"\narea: 'RFC 3 ''Layout'''\n---\n# q\n",
		);
		expect(await listOf(folder)).toMatch(/· next: decide: A or B · RFC 3 'Layout'$/);
	});

	test("works for a folder inside the project's own repository, dating each thread by git", async () => {
		git(project, ["init", "-q"]);
		const docs = path.join(project, "docs", "threads");
		fs.mkdirSync(docs, { recursive: true });
		thread("committed", { next: "ship it", area: "none" }, docs);
		commit(NOW - DAY, project, ["docs"]);
		thread("edited", { next: "review it", area: "none" }, docs);
		const lines = (await listOf({ path: docs, name: "docs/threads" })).split("\n");
		expect(lines[0]).toBe("Open threads in docs/threads/ (2):");
		expect(lines[1]).toMatch(/^- edited · updated .* \(uncommitted\) · next: review it$/);
		expect(lines[2]).toMatch(/^- committed · updated \d\d-\d\d \d\d:\d\d · next: ship it$/);
	});

	test("marks renamed and oddly named threads uncommitted, and reads CRLF files", async () => {
		thread("old", { next: "rename me", area: "none" });
		commit(NOW - DAY);
		git(notes, ["mv", "threads/old.md", "threads/renamed.md"]);
		fs.writeFileSync(path.join(folder.path, "with space.md"), "---\nnext: a\narea: none\n---\n");
		fs.writeFileSync(path.join(folder.path, "crlf.md"), "---\r\nnext: b\r\narea: none\r\n---\r\n# c\r\n");
		const [header, ...threads] = (await listOf(folder)).split("\n");
		expect(header).toBe("Open threads in notes/threads/ (3):");
		const lines = threads.toSorted();
		expect(lines[0]).toMatch(/^- crlf · updated .* \(uncommitted\) · next: b$/);
		expect(lines[1]).toMatch(/^- renamed · updated .* \(uncommitted\) · next: rename me$/);
		expect(lines[2]).toMatch(/^- with space · updated .* \(uncommitted\) · next: a$/);
	});

	test("keeps listing a thread with uncommitted changes, however old, so unsaved work stays in sight", async () => {
		thread("unsaved", { next: "commit me", area: "none" });
		commit(NOW - 30 * DAY);
		thread("unsaved", { next: "commit me now", area: "none" });
		const old = new Date((NOW - 20 * DAY) * 1000);
		fs.utimesSync(path.join(folder.path, "unsaved.md"), old, old);
		expect(await listOf(folder)).toMatch(/^- unsaved · updated .* \(uncommitted\) · next: commit me now$/m);
	});
});

describe("the threads folder", () => {
	test("is the one .omp/threads.json names, found from the project or any folder below it", async () => {
		fs.mkdirSync(path.join(project, "src", "deep"), { recursive: true });
		expect(await threadsFolder(io, place(path.join(project, "src", "deep")), undefined)).toEqual(folder);
		name("notes/threads/");
		expect(await threadsFolder(io, place(), undefined)).toEqual(folder);
	});

	test("is the folder setting's when one is set: the project's, the person's over it, the agent's over both", async () => {
		setting(project, "docs/threads");
		expect(await threadsFolder(io, place(), undefined)).toEqual({
			path: path.join(project, "docs", "threads"),
			name: "docs/threads",
		});
		// omp's choice kept in the project: over the project's file, relative to the project.
		expect(await threadsFolder(io, place(), { project: "repo/threads" })).toEqual({
			path: path.join(project, "repo", "threads"),
			name: "repo/threads",
		});
		setting(home, "threads/shop-api");
		const persons = { path: path.join(home, "threads", "shop-api"), name: "threads/shop-api" };
		expect(await threadsFolder(io, place(), undefined)).toEqual(persons);
		// A repo can't override the person.
		expect(await threadsFolder(io, place(), { project: "repo/threads" })).toEqual(persons);
		expect(await threadsFolder(io, place(), { person: "notes/threads" })).toEqual(folder);
		expect(await threadsFolder(io, place(), { person: "shared" })).toMatchObject({ name: "threads/shop-api" });
	});

	test("is never guessed: without either a project has none, and a .omp/threads.json naming none fails", async () => {
		fs.rmSync(path.join(project, ".omp"), { recursive: true });
		fs.mkdirSync(path.join(project, "library", "threads"), { recursive: true });
		expect(await threadsFolder(io, place(), undefined)).toBeUndefined();
		fs.mkdirSync(path.join(project, ".omp"));
		fs.writeFileSync(path.join(project, ".omp", "threads.json"), "{}");
		const failed = await threadsFolder(io, place(), undefined).then(
			() => "no error",
			(error: unknown) => String(error),
		);
		expect(failed).toContain('names no "folder"');
	});
});

const sent = (content: string) => ({ type: "custom_message", customType: THREADS_TYPE, content });
const update = async (branch: { type: string; customType?: string; content?: unknown }[] = []) =>
	(await threadsUpdate(io, place(), { choice: undefined, last: lastSent(branch), now: NOW }))?.text;

describe("what the agent is told", () => {
	test("is the list when it changed, and again after a compaction", async () => {
		thread("one", { next: "start", area: "none" });
		const list = await update();
		expect(list).toStartWith("Open threads in notes/threads/ (1):");
		expect(await update([sent(list ?? "")])).toBeUndefined();
		expect(await update([sent(list ?? ""), { type: "compaction" }])).toBe(list);
	});

	test("says there are no open threads once the last one closes, once", async () => {
		const none = "No open threads in notes/threads/.";
		expect(await update()).toBeUndefined();
		expect(await update([sent("Open threads in notes/threads/ (1):\n- one")])).toBe(none);
		expect(await update([sent(none)])).toBeUndefined();
	});

	test("says once that earlier lists no longer apply when nothing names a threads folder any more", async () => {
		fs.rmSync(path.join(project, ".omp"), { recursive: true });
		const gone = await update([sent("Open threads in notes/threads/ (1):\n- one")]);
		expect(gone).toStartWith("No threads folder here:");
		expect(await update([sent(gone ?? "")])).toBeUndefined();
		expect(await update()).toBeUndefined();
	});

	test("an agent without rules gets the rule's body, front matter left out", () => {
		const rule = "---\ndescription: Threads\nalwaysApply: true\n---\n# Threads\n\nRead the skill.\n";
		expect(ruleText(rule).text).toBe("# Threads\n\nRead the skill.");
	});
});
