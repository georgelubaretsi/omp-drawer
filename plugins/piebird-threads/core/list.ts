// The open-threads list: one line per thread file in the project's threads folder (folder.ts),
// read from the files and git only. A thread file has front matter with `next` (the next step)
// and `area` (where its design lives, or "none"), and a `## Open questions for you` section whose
// `- ` items are questions waiting on the user. Recency is the last commit touching the file, or
// the file's time while it has uncommitted changes; a committed thread with no commit for 10 days
// is dormant: counted, not listed. One with uncommitted changes is always listed, so unsaved work
// never drops out of sight. The folder's `done/` holds finished threads and is not read.
import type { Io } from "../kit/core/io";
import type { ModelText } from "../kit/core/model";
import type { ThreadsFolder } from "./folder";
import { joinText } from "../kit/core/model";
import { ThreadsError } from "./folder";
import { model } from "./model.gen";

const DORMANT_SECONDS = 10 * 24 * 60 * 60;

interface Thread {
	readonly slug: string;
	readonly next: string;
	readonly area: string;
	readonly questions: number;
	/** Seconds since the epoch. */
	readonly time: number;
	readonly uncommitted: boolean;
}

/** A thread file or git call that could not be read, and why. */
interface Unreadable {
	readonly source: string;
	readonly reason: string;
}

const reasonOf = (error: unknown): string =>
	error instanceof ThreadsError ? error.said.text : error instanceof Error ? error.message : String(error);

async function git(io: Io, folder: string, ...args: string[]): Promise<string> {
	const run = await io.run(["git", "-C", folder, ...args]);
	if (run.exitCode === 0) return run.stdout;
	const said = run.stderr.trim();
	throw said === "" ? new ThreadsError(model.text("reason-git-exited", { status: run.exitCode })) : new Error(said);
}

/** A front matter value, unquoted as YAML quotes a value containing ": ". */
function unquoted(value: string): string {
	const double = /^"(.*)"$/.exec(value)?.[1];
	if (double !== undefined) return double.replace(/\\(["\\])/g, "$1");
	const single = /^'(.*)'$/.exec(value)?.[1];
	return single === undefined ? value : single.replace(/''/g, "'");
}

function parse(slug: string, text: string): Omit<Thread, "time" | "uncommitted"> {
	const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
	if (front === undefined) throw new ThreadsError(model.text("reason-no-front-matter"));
	const field = (name: string): string => {
		const value = new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(front)?.[1]?.trim();
		if (!value) throw new ThreadsError(model.text("reason-no-field", { name }));
		return unquoted(value);
	};
	const section = /^## Open questions for you[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? "";
	return {
		slug,
		next: field("next"),
		area: field("area"),
		questions: section.split("\n").filter(line => line.startsWith("- ")).length,
	};
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** A time as the list shows it, in the computer's time zone: month-day hour:minute. */
function stamp(seconds: number): string {
	const date = new Date(seconds * 1000);
	return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// The names of the thread files with uncommitted changes. `-z` gives paths as they are, never
// quoted, and follows a rename or copy record with its source path, which is skipped.
async function uncommittedFiles(io: Io, folder: string, unreadable: Unreadable[]): Promise<Set<string>> {
	try {
		// Status paths start at the repository's root; the prefix is the folder's path from there.
		const prefix = (await git(io, folder, "rev-parse", "--show-prefix")).trim();
		const records = (await git(io, folder, "status", "--porcelain", "-z", "--untracked-files=all", "--", ".")).split(
			"\0",
		);
		const names = new Set<string>();
		for (let index = 0; index < records.length; index++) {
			const record = records[index] ?? "";
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

async function readThread(io: Io, folder: string, file: { name: string; modified: number }, dirty: Set<string>) {
	const text = await io.readText(`${folder}/${file.name}`);
	// Windows checkouts may turn line ends into CRLF.
	const thread = parse(file.name.slice(0, -3), (text ?? "").replaceAll("\r\n", "\n"));
	const uncommitted = dirty.has(file.name);
	const time = uncommitted
		? file.modified / 1000
		: Number((await git(io, folder, "log", "-1", "--format=%ct", "--", file.name)).trim());
	if (!Number.isFinite(time) || time === 0) throw new ThreadsError(model.text("reason-no-commit"));
	return { ...thread, time, uncommitted };
}

/** One thread's line: waiting questions first, then when it changed, its next step and its area. */
function threadLine(thread: Thread): ModelText {
	const details = [
		...(thread.questions > 0 ? [model.text("thread-waiting", { questions: thread.questions })] : []),
		model.text("thread-updated", { updated: stamp(thread.time), uncommitted: thread.uncommitted ? "yes" : "no" }),
		model.text("thread-next", { next: thread.next }),
		...(thread.area === "none" ? [] : [model.text("thread-area", { area: thread.area })]),
	];
	return details.reduce(
		(line, detail) => model.text("with-detail", { line: line.text, detail: detail.text }),
		model.text("thread", { slug: thread.slug }),
	);
}

/**
 * The list, or undefined when the folder has no open threads (dormant ones are still mentioned)
 * or doesn't exist yet. `now` is seconds since the epoch.
 */
export async function threadsList(io: Io, folder: ThreadsFolder, now: number): Promise<ModelText | undefined> {
	const entries = await io.list(folder.path);
	const files = (entries ?? [])
		.filter(e => !e.directory && e.name.endsWith(".md"))
		.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	if (files.length === 0) return undefined;
	const unreadable: Unreadable[] = [];
	const dirty = await uncommittedFiles(io, folder.path, unreadable);
	const threads: Thread[] = [];
	let dormant = 0;
	for (const file of files) {
		try {
			const thread = await readThread(io, folder.path, file, dirty);
			if (!thread.uncommitted && now - thread.time > DORMANT_SECONDS) dormant++;
			else threads.push(thread);
		} catch (error) {
			unreadable.push({ source: file.name, reason: reasonOf(error) });
		}
	}
	if (threads.length === 0 && unreadable.length === 0 && dormant === 0) return undefined;
	const sorted = threads.toSorted((a, b) => Number(b.questions > 0) - Number(a.questions > 0) || b.time - a.time);
	const listed = sorted.length > 0 || unreadable.length > 0 ? "yes" : "no";
	return joinText([
		model.text("list-header", { folder: folder.name, count: sorted.length, dormant, listed }),
		...sorted.map(threadLine),
		...unreadable.map(u => model.text("thread-unreadable", { source: u.source, reason: u.reason })),
	]);
}
