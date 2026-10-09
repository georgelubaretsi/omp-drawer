import { describe, expect, test } from "bun:test";
import { readChangelog, unreleasedEntries } from "./check";
import { cutText } from "./cut";
import { monthHeading, monthOf } from "./monthly";

const F = "CHANGELOG.md";
const HEADER = `# Changelog

All notable changes to this workspace are documented in this file.
`;
const AUGUST = `## [2026.08] - 2026-08-31

### Fixed

- An August fix.
`;
/** HEAD's changelog: two entries under Unreleased, last touched in September, and August's section. */
const HEAD = `${HEADER}
## [Unreleased]

### Added

- A September feature,
  over two lines.

### Fixed

- A September fix.

${AUGUST}`;
const SEPTEMBER = new Date(2026, 8, 20, 12);
const OCTOBER = new Date(2026, 9, 2, 12);
const head = { text: HEAD, touched: SEPTEMBER };

describe("cutText", () => {
	test("HEAD's entries move into their month's section, dated its last day; Unreleased is left empty", () => {
		expect(cutText(F, HEAD, head, OCTOBER)).toEqual({
			moved: 2,
			heading: "## [2026.09] - 2026-09-30",
			text: `${HEADER}
## [Unreleased]

## [2026.09] - 2026-09-30

### Added

- A September feature,
  over two lines.

### Fixed

- A September fix.

${AUGUST}`,
		});
	});

	test("an entry the working tree adds since HEAD stays under Unreleased", () => {
		const text = HEAD.replace("- A September fix.\n", "- A September fix.\n- An October fix.\n");
		const cut = cutText(F, text, head, OCTOBER);
		if (!("text" in cut)) throw new Error(JSON.stringify(cut));
		const read = readChangelog(F, cut.text);
		if (!read.unreleased || !read.parsed) throw new Error(read.problems.join("\n"));
		expect(unreleasedEntries(read.unreleased)).toEqual(["fixed: - An October fix."]);
		const september = read.parsed.changelog.releases.find(r => read.parsed?.versions.get(r) === "2026.09");
		expect(september && unreleasedEntries(september)).toEqual([
			"added: - A September feature,\n  over two lines.",
			"fixed: - A September fix.",
		]);
	});

	test("an entry edited since HEAD stays; the unchanged one moves", () => {
		const text = HEAD.replace("- A September fix.", "- A September fix, reworded.");
		const cut = cutText(F, text, head, OCTOBER);
		expect("text" in cut && cut.moved).toBe(1);
		expect("text" in cut && cut.text).toContain(
			"## [Unreleased]\n\n### Fixed\n\n- A September fix, reworded.\n\n## [2026.09]",
		);
	});

	test("nothing to cut in the same month, without HEAD's file, or without HEAD's entries", () => {
		expect(cutText(F, HEAD, { text: HEAD, touched: new Date(2026, 9, 1) }, OCTOBER)).toEqual({
			skip: "its Unreleased entries are from this month, 2026.10",
		});
		expect(cutText(F, HEAD, undefined, OCTOBER)).toEqual({ skip: "HEAD has no such file" });
		const empty = `${HEADER}\n## [Unreleased]\n\n${AUGUST}`;
		expect(cutText(F, empty, { text: empty, touched: SEPTEMBER }, OCTOBER)).toEqual({
			skip: "its Unreleased section has no entries from 2026.09",
		});
	});

	test("refused when the month already has a section or the file has problems", () => {
		expect(cutText(F, HEAD, { text: HEAD, touched: new Date(2026, 7, 5) }, OCTOBER)).toEqual({
			problem: `${F}: already has a 2026.08 section; move the entries by hand`,
		});
		expect(cutText(F, `${HEADER}\n## [1.0.0] - 2026-01-01\n`, head, OCTOBER)).toEqual({
			problem: `${F}: has no "## [Unreleased]" section; add one above the releases (it may be empty)\n${F}: release 1.0.0 isn't a month; this changelog's sections are "## [YYYY.MM] - YYYY-MM-DD"`,
		});
	});

	test("a month's heading is dated its last day", () => {
		expect(
			[new Date(2028, 1, 10), new Date(2026, 11, 31), new Date(2027, 0, 1)].map(d => monthHeading(monthOf(d))),
		).toEqual(["## [2028.02] - 2028-02-29", "## [2026.12] - 2026-12-31", "## [2027.01] - 2027-01-31"]);
	});
});
