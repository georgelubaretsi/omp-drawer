// The command lines: `bun tools/check-changelog.ts <file>...` (each file's name and format) and
// `bun tools/check-changelog-entries.ts [--opted-out] [--touched <changelog> <time>]... <changes>
// <paths> <parent> <staged>` (the commit-msg check, run by tools/check-changelog-entries.sh).
// Exit codes: 0 ok, 1 problems, 2 the check can't run.
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { changelogProblems } from "./check";
import { type Change, type Commit, missingEntries, type Reader, staleMonths } from "./entries";
import { isMonthly } from "./monthly";

/** The file's text; undefined when it doesn't exist. Any other read error is thrown. */
export async function readText(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (e) {
		if (e instanceof Error && "code" in e && e.code === "ENOENT") return undefined;
		throw e;
	}
}

/**
 * Problems of each changelog file: misnamed (a changelog is found by its exact name), missing, not
 * Keep a Changelog, without its one `## [Unreleased]` section, or with a release outside its
 * scheme (a monthly changelog's months, as each path names it from the workspace root).
 */
export async function fileProblems(files: string[]): Promise<string[]> {
	const problems: string[] = [];
	for (const file of files) {
		if (basename(file) !== "CHANGELOG.md") problems.push(`${file}: must be named exactly CHANGELOG.md`);
		const text = await readText(file);
		const scheme = { monthly: isMonthly(file) };
		problems.push(...(text === undefined ? [`${file}: missing`] : changelogProblems(file, text, scheme)));
	}
	return problems;
}

export async function checkFiles(files: string[]): Promise<number> {
	if (files.length === 0) {
		console.error("usage: bun tools/check-changelog.ts <CHANGELOG.md>...");
		return 2;
	}
	const problems = await fileProblems(files);
	if (problems.length === 0) return 0;
	console.error(`Invalid changelogs (Keep a Changelog 2.0.0):\n${problems.map(p => `  ${p}`).join("\n")}`);
	return 1;
}

/** `git diff-index -z --name-status` output: status and path, each NUL-terminated. */
export function parseChanges(raw: string): Change[] | undefined {
	const fields = raw.split("\0");
	if (fields.pop() !== "" || fields.length % 2 !== 0) return undefined;
	const changes: Change[] = [];
	for (let i = 0; i < fields.length; i += 2) changes.push({ status: fields[i], path: fields[i + 1] });
	return changes;
}

const OPT_OUT = `Add an entry for what users would notice. When nothing in the commit is notable, end its
message with this trailer, after a blank line:

  Changelog: none`;

const USAGE = `usage: bun tools/check-changelog-entries.ts [--opted-out] [--touched <changelog> <time>]... <changes> <paths> <parent paths> <parent dir> <staged dir>
  <changes>: \`git diff-index -z --name-status\` output; <paths>: \`git ls-files -z\` of the index;
  <parent paths>: the parent's files written to <parent dir>, NUL-terminated;
  --touched: when the parent's last commit touching a monthly changelog was made, in Unix seconds`;

/** A NUL-terminated list of paths; undefined when the file is missing or the list isn't terminated. */
async function readPaths(file: string): Promise<string[] | undefined> {
	const raw = await readText(file);
	if (raw === undefined || (raw !== "" && !raw.endsWith("\0"))) return undefined;
	return raw.split("\0").slice(0, -1);
}

/** The text of the listed files under `dir`, by exact path: never a file this filesystem finds by another case. */
function reader(dir: string, listed: string[]): Reader {
	const exact = new Set(listed);
	return async rel => (exact.has(rel) ? readText(join(dir, rel)) : undefined);
}

/** The options before the positional arguments; undefined when one is malformed. */
function readOptions(args: string[]): { optedOut: boolean; touched: Map<string, Date>; rest: string[] } | undefined {
	let optedOut = false;
	const touched = new Map<string, Date>();
	let i = 0;
	for (; args[i] === "--opted-out" || args[i] === "--touched"; i++) {
		if (args[i] === "--opted-out") optedOut = true;
		else {
			const seconds = Number(args[i + 2]);
			if (!Number.isInteger(seconds) || args[i + 1] === undefined) return undefined;
			touched.set(args[i + 1], new Date(seconds * 1000));
			i += 2;
		}
	}
	return { optedOut, touched, rest: args.slice(i) };
}

/** The commit-msg check's arguments as a Commit, now; undefined when they are wrong. */
async function readCommit(args: string[]): Promise<Commit | undefined> {
	const options = readOptions(args);
	if (options?.rest.length !== 5) return undefined;
	const { optedOut, touched, rest } = options;
	const [changesFile, pathsFile, parentPathsFile, parentDir, stagedDir] = rest;
	const rawChanges = await readText(changesFile);
	const changes = rawChanges === undefined ? undefined : parseChanges(rawChanges);
	const [paths, parentPaths] = [await readPaths(pathsFile), await readPaths(parentPathsFile)];
	if (!changes || !paths || !parentPaths) return undefined;
	const [parent, staged] = [reader(parentDir, parentPaths), reader(stagedDir, paths)];
	return { changes, paths, parent, staged, optedOut, touched, now: new Date() };
}

export async function checkEntries(args: string[]): Promise<number> {
	const commit = await readCommit(args);
	if (!commit) {
		console.error(USAGE);
		return 2;
	}
	const [missing, stale] = [await missingEntries(commit), await staleMonths(commit)];
	if (missing.length > 0) {
		const list = missing.map(p => `  ${p}`).join("\n");
		console.error(`changelog: each thing this commit changes needs an entry in its CHANGELOG.md:\n${list}`);
		if (!commit.optedOut) console.error(OPT_OUT);
	}
	if (stale.length > 0) {
		const list = stale.map(p => `  ${p}`).join("\n");
		console.error(`changelog: an earlier month's entries are still under [Unreleased]:\n${list}`);
	}
	return missing.length + stale.length > 0 ? 1 : 0;
}
