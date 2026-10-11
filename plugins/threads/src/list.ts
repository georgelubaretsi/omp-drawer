// The open-threads list: one line per thread file in the project's threads folder (folder.ts),
// read from the files and git only. A thread file has front matter with `next` (the next step)
// and `area` (where its design lives, or "none"), and a `## Open questions for you` section whose
// `- ` items are questions waiting on the user. Recency is the last commit touching the file, or
// the file's time while it has uncommitted changes; a committed thread with no commit for 10 days
// is dormant: counted, not listed. One with uncommitted changes is always listed, so unsaved work
// never drops out of sight. The folder's `done/` holds finished threads and is not read.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ThreadsFolder } from "./folder";
import { templates } from "./templates";

const DORMANT_SECONDS = 10 * 24 * 60 * 60;

/** A thread file or git call that could not be read, and why. */
interface Unreadable {
	source: string;
	reason: string;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** An error whose message is one of list.md's reasons. */
const failure = (key: string, values?: Record<string, unknown>) =>
	new Error(templates.list.text(`reasons.${key}`, values));

interface Thread {
	slug: string;
	next: string;
	area: string;
	questions: number;
	time: number;
	uncommitted: boolean;
}

function git(folder: string, ...args: string[]): string {
	const result = spawnSync("git", ["-C", folder, ...args], { encoding: "utf8" });
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw result.stderr.trim() ? new Error(result.stderr.trim()) : failure("gitExited", { status: result.status });
	return result.stdout;
}

function parse(slug: string, text: string): Omit<Thread, "time" | "uncommitted"> {
	const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
	if (front === undefined) throw failure("noFrontMatter");
	const field = (name: string): string => {
		const value = new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(front)?.[1]?.trim();
		if (!value) throw failure("noField", { name });
		// A value containing ": " is quoted, as YAML requires.
		const double = /^"(.*)"$/.exec(value)?.[1];
		if (double !== undefined) return double.replace(/\\(["\\])/g, "$1");
		const single = /^'(.*)'$/.exec(value)?.[1];
		return single === undefined ? value : single.replace(/''/g, "'");
	};
	const section = /^## Open questions for you[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
	return {
		slug,
		next: field("next"),
		area: field("area"),
		questions: section.split("\n").filter(line => line.startsWith("- ")).length,
	};
}

const pad = (value: number) => String(value).padStart(2, "0");

function stamp(seconds: number): string {
	const date = new Date(seconds * 1000);
	return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The names of the thread files with uncommitted changes. `-z` gives paths as they are, never
// quoted, and follows a rename or copy record with its source path, which is skipped.
function uncommittedFiles(folder: string, unreadable: Unreadable[]): Set<string> {
	try {
		// Status paths start at the repository's root; the prefix is the folder's path from there.
		const prefix = git(folder, "rev-parse", "--show-prefix").trim();
		const records = git(folder, "status", "--porcelain", "-z", "--untracked-files=all", "--", ".").split("\0");
		const names = new Set<string>();
		for (let index = 0; index < records.length; index++) {
			const record = records[index];
			if (/[RC]/.test(record.slice(0, 2))) index++;
			const name = record.slice(3);
			if (name.startsWith(prefix) && !name.slice(prefix.length).includes("/")) names.add(name.slice(prefix.length));
		}
		return names;
	} catch (error) {
		unreadable.push({ source: "git status", reason: reasonOf(error) });
		return new Set();
	}
}

function readThread(folder: string, file: string, dirty: Set<string>): Thread {
	const path = join(folder, file);
	// Windows checkouts may turn line ends into CRLF.
	const thread = parse(file.slice(0, -3), readFileSync(path, "utf8").replaceAll("\r\n", "\n"));
	const uncommitted = dirty.has(file);
	const time = uncommitted
		? statSync(path).mtimeMs / 1000
		: Number(git(folder, "log", "-1", "--format=%ct", "--", file).trim());
	if (!Number.isFinite(time) || time === 0) throw failure("noCommit");
	return { ...thread, time, uncommitted };
}

// One thread as list.md shows it; an area of "none" is left out.
function threadView(thread: Thread): Record<string, unknown> {
	const { slug, questions, uncommitted, next, area } = thread;
	return { slug, questions, uncommitted, next, updated: stamp(thread.time), area: area === "none" ? undefined : area };
}

/**
 * The list, or "" when the folder has no open threads (dormant ones are still mentioned) or
 * doesn't exist yet.
 */
export function renderThreads(folder: ThreadsFolder, now = Date.now() / 1000): string {
	if (!existsSync(folder.path)) return "";
	const files = readdirSync(folder.path, { withFileTypes: true })
		.filter(entry => entry.isFile() && entry.name.endsWith(".md"))
		.map(entry => entry.name)
		.toSorted();
	if (files.length === 0) return "";
	const unreadable: Unreadable[] = [];
	const dirty = uncommittedFiles(folder.path, unreadable);
	const threads: Thread[] = [];
	let dormant = 0;
	for (const file of files) {
		try {
			const thread = readThread(folder.path, file, dirty);
			if (!thread.uncommitted && now - thread.time > DORMANT_SECONDS) dormant++;
			else threads.push(thread);
		} catch (error) {
			unreadable.push({ source: file, reason: reasonOf(error) });
		}
	}
	if (threads.length === 0 && unreadable.length === 0 && dormant === 0) return "";
	threads.sort((a, b) => Number(b.questions > 0) - Number(a.questions > 0) || b.time - a.time);
	return templates.list.render({ folder: folder.name, threads: threads.map(threadView), dormant, unreadable });
}
