// Changelogs in Keep a Changelog format (https://keepachangelog.com/en/2.0.0/), parsed by the
// keep-a-changelog package: the parser is the authority on the structure, and headings count as it
// reads them. Its forms are `## [Unreleased]` and `## [<version>] - YYYY-MM-DD`; it also takes
// looser ones (any heading holding "unreleased" as the Unreleased section, an unbracketed version),
// which are accepted, not matched literally. It lowercases versions. The monthly changelogs
// (monthly.ts) have month sections instead of releases; no other changelog may have one.
import { type Changelog, parser, Release } from "keep-a-changelog";
import { MONTH_VERSION, MONTHLY, monthProblems } from "./monthly";

const AT_END =
	" at its last heading or entry (release headings are `## [<version>] - YYYY-MM-DD`; " +
	"change types Added, Changed, Deprecated, Removed, Fixed and Security)";
const UNRELEASED = "## [Unreleased]";

/** A parsed changelog, with each release's version as its heading gives it (lowercased by the parser). */
interface Parsed {
	changelog: Changelog;
	versions: Map<Release, string>;
}

/** The parsed changelog, or the problem that stops it from parsing. `file` names it in the problem. */
function parseChangelog(file: string, text: string): Parsed | { problem: string } {
	if (text.trim() === "") return { problem: `${file}: is empty; start it with the Keep a Changelog header` };
	const versions = new Map<Release, string>();
	// The parser hands each heading's version text to releaseCreator; Release keeps only its Semantic
	// Versioning reading, which drops a `v` prefix and build metadata.
	const releaseCreator = (version?: string, date?: string, description?: string) => {
		const release = new Release(version, date, description);
		if (version !== undefined) versions.set(release, version.trim());
		return release;
	};
	try {
		return { changelog: parser(text, { releaseCreator }), versions };
	} catch (e) {
		// The parser reports the line of the next token; when its input has run out, it throws a
		// TypeError instead, losing the reason.
		const reason = e instanceof TypeError ? AT_END : `: ${e instanceof Error ? e.message : String(e)}`;
		return { problem: `${file}: not in Keep a Changelog format${reason}` };
	}
}

/** A changelog as read: parsed when it parses, its Unreleased section when there are no problems. */
export interface ReadChangelog {
	parsed?: Parsed;
	unreleased?: Release;
	problems: string[];
}

/** Problems with the Unreleased section of a parsed changelog; the section when there are none. */
function unreleasedSection(file: string, { changelog, versions }: Parsed): ReadChangelog {
	const undated = changelog.releases.filter(r => r.date === undefined);
	const problems = undated
		.filter(r => versions.has(r))
		.map(r => `${file}: release ${versions.get(r)} has no date; write "## [<version>] - YYYY-MM-DD"`);
	const sections = undated.filter(r => !versions.has(r));
	if (sections.length === 0)
		problems.push(`${file}: has no "${UNRELEASED}" section; add one above the releases (it may be empty)`);
	else if (sections.length > 1) problems.push(`${file}: has ${sections.length} Unreleased sections; keep one`);
	return problems.length > 0 ? { problems } : { unreleased: sections[0], problems };
}

/** The changelog, with every problem in its format and its Unreleased section. */
export function readChangelog(file: string, text: string): ReadChangelog {
	const parsed = parseChangelog(file, text);
	if ("problem" in parsed) return { problems: [parsed.problem] };
	return { parsed, ...unreleasedSection(file, parsed) };
}

/** Problems of a changelog whose newest release must be plugin.json's `version`; none when it has no release. */
function versionProblems(file: string, { changelog, versions }: Parsed, version: string): string[] {
	// The parser sorts releases newest first, one whose version isn't Semantic Versioning before them.
	const newest = changelog.releases.find(r => r.date !== undefined);
	if (!newest) return [];
	const raw = versions.get(newest);
	if (raw === version.toLowerCase()) return [];
	return [`${file}: the newest release is ${raw ?? "unversioned"}, but plugin.json has version ${version}`];
}

/** Problems of each dated release's version: not a month in a monthly changelog, a month in any other. */
function schemeProblems(file: string, { changelog, versions }: Parsed, monthly: boolean): string[] {
	return changelog.releases.flatMap(r => {
		const raw = versions.get(r);
		// Undated releases are reported already; the Unreleased section has no version.
		if (raw === undefined || r.date === undefined) return [];
		if (monthly) return monthProblems(file, raw, r.date);
		if (!MONTH_VERSION.test(raw)) return [];
		return [`${file}: release ${raw} is a month section; only ${MONTHLY.join(" and ")} have them`];
	});
}

/** How a changelog's releases are versioned: monthly sections, or releases with plugin.json's `version`. */
export interface Scheme {
	monthly?: boolean;
	version?: string;
}

/**
 * Problems of changelog `file` holding `text`: it doesn't parse, or its Unreleased section is
 * missing or repeated, or a release has no date or a version outside its scheme, or (when
 * `version` is given) its newest release isn't plugin.json's version. No release at all is fine.
 */
export function changelogProblems(file: string, text: string, scheme: Scheme = {}): string[] {
	const read = readChangelog(file, text);
	if (!read.parsed) return read.problems;
	const problems = [...read.problems, ...schemeProblems(file, read.parsed, scheme.monthly ?? false)];
	if (scheme.version === undefined) return problems;
	return [...problems, ...versionProblems(file, read.parsed, scheme.version)];
}

/** Each entry under the Unreleased section as "<type>: <text>". */
export function unreleasedEntries(unreleased: Release): string[] {
	return [...unreleased.changes].flatMap(([type, changes]) => changes.map(c => `${type}: ${c.toString()}`));
}

/** Whether `after` holds an entry that `before` doesn't, counting repeats (an edited entry is new). */
export function addsEntry(before: string[], after: string[]): boolean {
	const left = new Map<string, number>();
	for (const e of before) left.set(e, (left.get(e) ?? 0) + 1);
	return after.some(e => {
		const n = left.get(e) ?? 0;
		left.set(e, n - 1);
		return n <= 0;
	});
}
