// Which changelog a commit must add an entry to. Each folder plugins/plugins/<name>/ is a plugin
// with its own CHANGELOG.md; every other path in plugins/ belongs to the public repo's own
// plugins/CHANGELOG.md, and every path outside plugins/ to the workspace's root CHANGELOG.md.
// A thing whose files a commit changes keeps its changelog, and unless the commit changes only the
// changelog or opts out, the changelog gets a new entry under Unreleased: one the commit's parent
// doesn't have. The monthly changelogs (monthly.ts) get no new entry while their Unreleased
// section holds an earlier month's. tools/check-changelog-entries.sh supplies the changes, the
// index's paths, both states, when the parent last touched each monthly changelog and whether the
// message opts out.
import { addsEntry, readChangelog, unreleasedEntries } from "./check";
import { MONTHLY, monthOf, monthVersion } from "./monthly";

const PUBLIC = "plugins/CHANGELOG.md";

/** One path the commit changes, with git's status letter (A added, D deleted, M, T, ...). */
export interface Change {
	status: string;
	path: string;
}

/** The changelog that `path` (relative to the workspace root) belongs to. */
export function ownerOf(path: string): string {
	const own = /^plugins\/plugins\/([^/]+)\//.exec(path);
	if (own) return `plugins/plugins/${own[1]}/CHANGELOG.md`;
	return path.startsWith("plugins/") ? PUBLIC : "CHANGELOG.md";
}

/** How the report names the thing that `changelog` belongs to. */
function thing(changelog: string): string {
	if (changelog === "CHANGELOG.md") return "the workspace";
	return changelog === PUBLIC ? "the public repo" : `plugin ${changelog.split("/")[2]}`;
}

/** Each changelog the commit changes files of (itself included), with those changes. */
function owners(changes: Change[]): Map<string, Change[]> {
	const byOwner = new Map<string, Change[]>();
	for (const change of changes) {
		const owner = ownerOf(change.path);
		byOwner.set(owner, [...(byOwner.get(owner) ?? []), change]);
	}
	return byOwner;
}

/** The text of `rel` in one state, undefined when that state has no such file. */
export type Reader = (rel: string) => Promise<string | undefined>;

/** What the commit-msg check knows about the commit. */
export interface Commit {
	changes: Change[];
	/** Every path the commit's tree holds (the index). */
	paths: string[];
	parent: Reader;
	staged: Reader;
	/** The message carries `Changelog: none`: no entries needed, but the changelogs must still exist. */
	optedOut: boolean;
	/** When the parent's last commit touching each monthly changelog was made. */
	touched: Map<string, Date>;
	now: Date;
}

/**
 * Why `owner`'s changelog in the commit doesn't do: it is missing, or (unless the commit opts out
 * or changes only the changelog) it has problems or adds no entry under Unreleased over the
 * parent's. The workspace's is always required, the public repo's while plugins/ has files, a
 * plugin's only while its folder has files, so one removed with its folder needs none.
 */
async function missing(owner: string, changes: Change[], commit: Commit): Promise<string[]> {
	const text = await commit.staged(owner);
	if (text === undefined) {
		const dir = owner.slice(0, -"CHANGELOG.md".length);
		if (dir !== "" && !commit.paths.some(p => p.startsWith(dir))) return [];
		const plugin = dir !== "" && owner !== PUBLIC;
		const why = plugin ? "a plugin keeps one while its folder has files" : `${thing(owner)} keeps one`;
		return [`${thing(owner)}: ${owner} is missing; ${why}, with an entry under [Unreleased]`];
	}
	if (commit.optedOut || changes.every(c => c.path === owner)) return [];
	const after = readChangelog(owner, text);
	if (!after.unreleased) return after.problems.map(p => `${thing(owner)}: ${p}`);
	// A parent without the file, or with one that has problems, has no entries to repeat.
	const old = await commit.parent(owner);
	const before = old === undefined ? undefined : readChangelog(owner, old).unreleased;
	if (addsEntry(before ? unreleasedEntries(before) : [], unreleasedEntries(after.unreleased))) return [];
	return [`${thing(owner)}: no new entry under [Unreleased] in ${owner}`];
}

/** Every problem with the changelogs of the things the commit changes, in changelog order. */
export async function missingEntries(commit: Commit): Promise<string[]> {
	const problems: string[] = [];
	const byOwner = [...owners(commit.changes)].toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	for (const [owner, ownerChanges] of byOwner) problems.push(...(await missing(owner, ownerChanges, commit)));
	return problems;
}

/**
 * Problems with the monthly changelogs: the commit adds or edits an entry while Unreleased still
 * holds entries of the parent's, last changed in an earlier month (when the parent last touched
 * the file). Those move into their month's section first, opted out or not.
 */
export async function staleMonths(commit: Commit): Promise<string[]> {
	const problems: string[] = [];
	for (const changelog of MONTHLY) {
		const touched = commit.touched.get(changelog);
		if (touched === undefined || monthOf(touched) >= monthOf(commit.now)) continue;
		const [old, text] = [await commit.parent(changelog), await commit.staged(changelog)];
		const before = old === undefined ? undefined : readChangelog(changelog, old).unreleased;
		const after = text === undefined ? undefined : readChangelog(changelog, text).unreleased;
		if (!before || !after) continue;
		const [was, is] = [unreleasedEntries(before), unreleasedEntries(after)];
		if (!addsEntry(was, is) || !is.some(e => was.includes(e))) continue;
		const month = monthVersion(monthOf(touched));
		problems.push(`${changelog}: its Unreleased entries are from ${month}; run just changelog-cut first`);
	}
	return problems;
}
