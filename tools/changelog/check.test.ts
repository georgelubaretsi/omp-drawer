import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addsEntry, changelogProblems, readChangelog, unreleasedEntries } from "./check";
import { fileProblems, parseChanges } from "./cli";
import { isMonthly } from "./monthly";

const HEADER = `# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;
const UNRELEASED = `${HEADER}
## [Unreleased]

### Added

- A tool that does things,
  over two lines.
`;
const RELEASED = `${UNRELEASED}
## [1.2.0] - 2026-01-02

### Fixed

- A fix.

## [1.1.0] - 2026-01-01

### Added

- An older feature.
`;
const F = "CHANGELOG.md";

describe("changelogProblems", () => {
	const cases: { name: string; text: string; version?: string; errors: string[] }[] = [
		{ name: "Unreleased with entries", text: UNRELEASED, errors: [] },
		{ name: "empty Unreleased heading", text: `${HEADER}\n## [Unreleased]\n`, errors: [] },
		{ name: "no release, any version", text: UNRELEASED, version: "0.0.1", errors: [] },
		{ name: "newest release matches the version", text: RELEASED, version: "1.2.0", errors: [] },
		{ name: "release without a version to compare", text: RELEASED, errors: [] },
		{
			name: "newest release differs from the version",
			text: RELEASED,
			version: "1.3.0",
			errors: [`${F}: the newest release is 1.2.0, but plugin.json has version 1.3.0`],
		},
		{
			name: "an older release matching the version doesn't count",
			text: RELEASED,
			version: "1.1.0",
			errors: [`${F}: the newest release is 1.2.0, but plugin.json has version 1.1.0`],
		},
		{
			name: "no Unreleased section",
			text: `${HEADER}\n## [1.0.0] - 2026-01-01\n\n### Added\n\n- A.\n`,
			version: "1.0.0",
			errors: [`${F}: has no "## [Unreleased]" section; add one above the releases (it may be empty)`],
		},
		{
			name: "undated versioned heading in place of Unreleased",
			text: `${HEADER}\n## [1.1.0] - Unreleased\n\n### Added\n\n- A.\n`,
			errors: [
				`${F}: release 1.1.0 has no date; write "## [<version>] - YYYY-MM-DD"`,
				`${F}: has no "## [Unreleased]" section; add one above the releases (it may be empty)`,
			],
		},
		{
			name: "undated versioned heading beside Unreleased",
			text: `${UNRELEASED}\n## [1.1.0] - unreleased\n`,
			errors: [`${F}: release 1.1.0 has no date; write "## [<version>] - YYYY-MM-DD"`],
		},
		{
			name: "two Unreleased sections",
			text: `${UNRELEASED}\n## Unreleased\n\n### Fixed\n\n- B.\n`,
			errors: [`${F}: has 2 Unreleased sections; keep one`],
		},
		{
			name: "newest release with a v prefix",
			text: `${HEADER}\n## [Unreleased]\n\n## [v1.0.0] - 2026-01-01\n`,
			version: "1.0.0",
			errors: [`${F}: the newest release is v1.0.0, but plugin.json has version 1.0.0`],
		},
		{
			name: "newest release with build metadata",
			text: `${HEADER}\n## [Unreleased]\n\n## [1.0.0+b] - 2026-01-01\n`,
			version: "1.0.0",
			errors: [`${F}: the newest release is 1.0.0+b, but plugin.json has version 1.0.0`],
		},
		{
			name: "newest release whose version isn't Semantic Versioning",
			text: `${HEADER}\n## [Unreleased]\n\n## [next] - 2026-01-01\n`,
			version: "1.0.0",
			errors: [`${F}: the newest release is next, but plugin.json has version 1.0.0`],
		},
		{ name: "empty file", text: "\n", errors: [`${F}: is empty; start it with the Keep a Changelog header`] },
		{
			name: "no title",
			text: "## [Unreleased]\n",
			errors: [`${F}: not in Keep a Changelog format: Parse error in the line 1: Required token missing in: "1"`],
		},
		{
			name: "release heading without a date",
			text: `${HEADER}\n## [Unreleased]\n\n## Next\n\n### Added\n`,
			errors: [
				`${F}: not in Keep a Changelog format: Parse error in the line 12: Syntax error in the release title`,
			],
		},
		{
			name: "unknown change type",
			text: `${HEADER}\n## [Unreleased]\n\n### Improved\n\n- A.\n\n### Added\n`,
			errors: [`${F}: not in Keep a Changelog format: Parse error in the line 14: Invalid change type`],
		},
		{
			name: "unknown change type at the end (the parser loses the reason)",
			text: `${HEADER}\n## [Unreleased]\n\n### Improved\n\n- A.\n`,
			errors: [
				`${F}: not in Keep a Changelog format at its last heading or entry (release headings are \`## [<version>] - YYYY-MM-DD\`; change types Added, Changed, Deprecated, Removed, Fixed and Security)`,
			],
		},
		{
			name: "loose paragraph under a change type",
			text: `${HEADER}\n## [Unreleased]\n\n### Added\n\nSome notes.\n`,
			errors: [
				`${F}: not in Keep a Changelog format: Parse error in the line 11: Unexpected content [[11,"p",["Some notes."]]]`,
			],
		},
	];
	for (const c of cases) {
		test(c.name, () => {
			expect(changelogProblems(F, c.text, { version: c.version })).toEqual(c.errors);
		});
	}
});

describe("changelogProblems: month sections", () => {
	const months = `${UNRELEASED}\n## [2026.09] - 2026-09-30\n\n### Added\n\n- B.\n\n## [2026.08] - 2026-08-01\n\n### Fixed\n\n- C.\n`;
	const cases: { name: string; text: string; monthly: boolean; errors: string[] }[] = [
		{ name: "monthly changelog with month sections", text: months, monthly: true, errors: [] },
		{
			name: "month sections in a plugin's changelog",
			text: months,
			monthly: false,
			errors: ["2026.09", "2026.08"].map(
				v => `${F}: release ${v} is a month section; only CHANGELOG.md and plugins/CHANGELOG.md have them`,
			),
		},
		{
			name: "a Semantic Versioning release in a monthly changelog",
			text: RELEASED,
			monthly: true,
			errors: ["1.2.0", "1.1.0"].map(
				v => `${F}: release ${v} isn't a month; this changelog's sections are "## [YYYY.MM] - YYYY-MM-DD"`,
			),
		},
		{
			name: "a month section dated outside its month",
			text: `${UNRELEASED}\n## [2026.09] - 2026-10-01\n`,
			monthly: true,
			errors: [`${F}: release 2026.09 is dated 2026-10-01, outside its month`],
		},
		{
			name: "month 13",
			text: `${UNRELEASED}\n## [2026.13] - 2026-12-31\n`,
			monthly: true,
			errors: [`${F}: release 2026.13 isn't a month; this changelog's sections are "## [YYYY.MM] - YYYY-MM-DD"`],
		},
	];
	for (const c of cases) {
		test(c.name, () => {
			expect(changelogProblems(F, c.text, { monthly: c.monthly })).toEqual(c.errors);
		});
	}
	test("which files are monthly, by path from the workspace root", () => {
		const files = ["CHANGELOG.md", "./plugins/CHANGELOG.md", "plugins/plugins/x/CHANGELOG.md"];
		expect(files.map(f => isMonthly(f))).toEqual([true, true, false]);
	});
});

/** The Unreleased entries of a changelog that must have no problems. */
function entries(text: string): string[] {
	const read = readChangelog(F, text);
	if (!read.unreleased) throw new Error(read.problems.join("\n"));
	return unreleasedEntries(read.unreleased);
}

describe("unreleasedEntries and addsEntry", () => {
	test("entries under Unreleased only, with their type and whole text", () => {
		expect(entries(RELEASED)).toEqual(["added: - A tool that does things,\n  over two lines."]);
	});
	test("a changelog with problems has no Unreleased section to read", () => {
		expect(readChangelog(F, `${HEADER}\n## [1.1.0] - Unreleased\n\n### Added\n\n- A.\n`).unreleased).toBeUndefined();
	});
	test("new, edited and repeated entries are added; reordered and removed ones are not", () => {
		expect(addsEntry(["added: - a"], ["added: - a", "added: - b"])).toBe(true);
		expect(addsEntry(["added: - a"], ["added: - a2"])).toBe(true);
		expect(addsEntry(["added: - a"], ["added: - a", "added: - a"])).toBe(true);
		expect(addsEntry(["added: - a"], ["fixed: - a"])).toBe(true);
		expect(addsEntry(["added: - a", "added: - b"], ["added: - b", "added: - a"])).toBe(false);
		expect(addsEntry(["added: - a", "added: - b"], ["added: - a"])).toBe(false);
		expect(addsEntry([], [])).toBe(false);
	});
});

describe("files", () => {
	let dir = "";
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	test("each file's problems, a missing or misnamed one named", async () => {
		dir = await mkdtemp(join(tmpdir(), "changelog-"));
		for (const d of ["ok", "bad", "case"]) await mkdir(join(dir, d));
		await writeFile(join(dir, "ok/CHANGELOG.md"), UNRELEASED);
		await writeFile(join(dir, "bad/CHANGELOG.md"), `${HEADER}\n## [1.0.0] - 2026-01-01\n`);
		await writeFile(join(dir, "case/changelog.md"), UNRELEASED);
		const files = ["ok/CHANGELOG.md", "bad/CHANGELOG.md", "gone/CHANGELOG.md", "case/changelog.md"].map(f =>
			join(dir, f),
		);
		expect(await fileProblems(files)).toEqual([
			`${files[1]}: has no "## [Unreleased]" section; add one above the releases (it may be empty)`,
			`${files[2]}: missing`,
			`${files[3]}: must be named exactly CHANGELOG.md`,
		]);
	});

	test("git's NUL-terminated name-status output", () => {
		expect(parseChanges("M\0a b\0D\0-x\0")).toEqual([
			{ status: "M", path: "a b" },
			{ status: "D", path: "-x" },
		]);
		expect(parseChanges("")).toEqual([]);
		expect(parseChanges("M\0a")).toBeUndefined();
		expect(parseChanges("M\0")).toBeUndefined();
	});
});
