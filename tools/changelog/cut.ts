// `bun tools/changelog-cut.ts [<file>...]` (default: the monthly changelogs, monthly.ts): closes a
// monthly changelog's Unreleased section into its month's section. The entries HEAD's Unreleased
// holds were last changed when HEAD's last commit touching the file was made; once that month is
// over, they move into `## [YYYY.MM] - YYYY-MM-DD` (its last day), right under Unreleased. Entries
// the working tree adds or edits since HEAD stay under Unreleased: they are this month's.
// The file is edited as text, so the rest keeps its form; the result is parsed again to check it.
import { writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { Release } from "keep-a-changelog";
import { changelogProblems, readChangelog, unreleasedEntries } from "./check";
import { readText } from "./cli";
import { MONTHLY, monthHeading, monthOf, monthVersion } from "./monthly";

const TYPES = ["added", "changed", "deprecated", "removed", "fixed", "security"];

/** One entry under Unreleased: its change type and its text as written. */
interface Entry {
	type: string;
	text: string;
}

/** The Unreleased section of a changelog the parser accepts, line by line: its heading, end, text before the first type, entries. */
function sectionOf(lines: string[]) {
	const heading = lines.findIndex(l => l.startsWith("## ") && /unreleased/i.test(l));
	const next = lines.findIndex((l, i) => i > heading && l.startsWith("## "));
	const end = next < 0 ? lines.length : next;
	const description: string[] = [];
	const entries: { type: string; lines: string[] }[] = [];
	let type: string | undefined;
	let current: string[] | undefined;
	for (const line of lines.slice(heading + 1, end)) {
		const typeHeading = /^### +(.+?)\s*$/.exec(line);
		if (typeHeading) [type, current] = [typeHeading[1].toLowerCase(), undefined];
		else if (type === undefined) description.push(line);
		else if (/^[-*+] /.test(line)) entries.push({ type, lines: (current = [line]) });
		else current?.push(line);
	}
	const written = entries.map(e => ({ type: e.type, text: e.lines.join("\n").trimEnd() }));
	return { heading, end, description: description.join("\n").trim(), entries: written };
}

/** Each entry's text as the parser reads it (unreleasedEntries), in the written entries' order; undefined when they disagree. */
function keysOf(entries: Entry[], unreleased: Release): string[] | undefined {
	const parsed = new Map([...unreleased.changes].map(([type, changes]) => [type, changes.map(c => c.toString())]));
	const seen = new Map<string, number>();
	const keys = entries.map(e => {
		const n = seen.get(e.type) ?? 0;
		seen.set(e.type, n + 1);
		const text = parsed.get(e.type)?.[n];
		return text === undefined ? undefined : `${e.type}: ${text}`;
	});
	const total = [...parsed.values()].reduce((sum, list) => sum + list.length, 0);
	return keys.length === total && keys.every((k): k is string => k !== undefined) ? keys : undefined;
}

/** Entries as markdown blocks, one `### <Type>` each, in Keep a Changelog's order. */
function render(entries: Entry[]): string[] {
	return TYPES.flatMap(type => {
		const of = entries.filter(e => e.type === type).map(e => e.text);
		return of.length === 0 ? [] : [`### ${type[0].toUpperCase()}${type.slice(1)}\n\n${of.join("\n")}`];
	});
}

/** HEAD's version of a changelog: its text and when HEAD's last commit touching it was made. */
export interface Head {
	text: string;
	touched: Date;
}

/** What cutting a changelog does: its new text, or why it stays as it is, or what stops it. */
export type Cut = { text: string; moved: number; heading: string } | { skip: string } | { problem: string };

/** Whether two lists hold the same entries, in any order. */
function sameEntries(a: string[], b: string[]): boolean {
	return a.toSorted().join("\0") === b.toSorted().join("\0");
}

/** Whether `text` parses with no problems, the kept entries under Unreleased and the moved ones under `version`. */
function holds(file: string, text: string, version: string, keys: { kept: string[]; moved: string[] }): boolean {
	const read = readChangelog(file, text);
	if (changelogProblems(file, text, { monthly: true }).length > 0 || !read.unreleased || !read.parsed) return false;
	const { versions } = read.parsed;
	const release = read.parsed.changelog.releases.find(r => versions.get(r) === version);
	if (!release || !sameEntries(unreleasedEntries(read.unreleased), keys.kept)) return false;
	return sameEntries(unreleasedEntries(release), keys.moved);
}

/** Changelog `file` holding `text`, cut `now`: HEAD's Unreleased entries moved into their month's section. */
export function cutText(file: string, text: string, head: Head | undefined, now: Date): Cut {
	const problems = changelogProblems(file, text, { monthly: true });
	const after = readChangelog(file, text);
	if (problems.length > 0 || !after.unreleased || !after.parsed) return { problem: problems.join("\n") };
	if (!head) return { skip: "HEAD has no such file" };
	const month = monthOf(head.touched);
	const version = monthVersion(month);
	if (month >= monthOf(now)) return { skip: `its Unreleased entries are from this month, ${version}` };
	const lines = text.split("\n");
	const section = sectionOf(lines);
	const keys = keysOf(section.entries, after.unreleased);
	if (!keys) return { problem: `${file}: can't tell its Unreleased entries apart; move them by hand` };
	const before = readChangelog(file, head.text).unreleased;
	const old = before ? unreleasedEntries(before) : [];
	const [moved, kept] = [[] as Entry[], [] as Entry[]];
	const [movedKeys, keptKeys] = [[] as string[], [] as string[]];
	section.entries.forEach((entry, i) => {
		const at = old.indexOf(keys[i]);
		if (at >= 0) old.splice(at, 1);
		(at >= 0 ? moved : kept).push(entry);
		(at >= 0 ? movedKeys : keptKeys).push(keys[i]);
	});
	if (moved.length === 0) return { skip: `its Unreleased section has no entries from ${version}` };
	if ([...after.parsed.versions.values()].includes(version))
		return { problem: `${file}: already has a ${version} section; move the entries by hand` };
	const heading = monthHeading(month);
	const rest = lines.slice(section.end).join("\n").trim();
	const prefix = lines.slice(0, section.heading + 1).join("\n");
	const parts = [prefix, section.description, ...render(kept), heading, ...render(moved), rest];
	const cut = `${parts.filter(p => p !== "").join("\n\n")}\n`;
	if (!holds(file, cut, version, { kept: keptKeys, moved: movedKeys }))
		return { problem: `${file}: the cut would change its entries; move them by hand` };
	return { text: cut, moved: moved.length, heading };
}

/** `git -C <dir> <args>`'s output; undefined when it fails. */
function git(dir: string, args: string[]): string | undefined {
	const run = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "ignore" });
	return run.exitCode === 0 ? run.stdout.toString() : undefined;
}

/** HEAD's version of `file`, from git; undefined when HEAD has none. */
function headOf(file: string): Head | undefined {
	const [dir, name] = [dirname(file), basename(file)];
	const touched = git(dir, ["log", "-1", "--format=%ct", "HEAD", "--", name])?.trim();
	const text = touched ? git(dir, ["show", `HEAD:./${name}`]) : undefined;
	return touched && text !== undefined ? { text, touched: new Date(Number(touched) * 1000) } : undefined;
}

/** Cuts each file (default: the monthly changelogs) and reports what it did. Exit codes: 0 ok, 1 problems. */
export async function cutFiles(files: string[], now = new Date()): Promise<number> {
	let status = 0;
	for (const file of files.length > 0 ? files : MONTHLY) {
		const text = await readText(file);
		const cut: Cut = text === undefined ? { problem: `${file}: missing` } : cutText(file, text, headOf(file), now);
		if ("text" in cut) {
			await writeFile(file, cut.text);
			console.log(`${file}: moved ${cut.moved} entries into ${cut.heading}`);
		} else if ("skip" in cut) console.log(`${file}: nothing to cut; ${cut.skip}`);
		else {
			console.error(cut.problem);
			status = 1;
		}
	}
	return status;
}
