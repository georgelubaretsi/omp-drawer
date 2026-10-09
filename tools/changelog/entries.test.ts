import { describe, expect, test } from "bun:test";
import { type Change, missingEntries, ownerOf, type Reader, staleMonths } from "./entries";

const ROOT = "CHANGELOG.md";
const PUBLIC = "plugins/CHANGELOG.md";
const TERN = "plugins/plugins/tern/CHANGELOG.md";
const WORKFLOW = "plugins/plugins/workflow/CHANGELOG.md";
const VARIANTS = "plugins/plugins/agent-variants/CHANGELOG.md";
const log = (...entries: string[]) =>
	`# Changelog\n\n## [Unreleased]\n${entries.length > 0 ? `\n### Added\n\n${entries.map(e => `- ${e}\n`).join("")}` : ""}`;
const reader =
	(files: Record<string, string>): Reader =>
	async rel =>
		files[rel];
const M = (path: string): Change => ({ status: "M", path });
const D = (path: string): Change => ({ status: "D", path });
const A = (path: string): Change => ({ status: "A", path });
/** Files of the index in every case, unless the case deletes them. */
const OTHER = [
	"plugins/plugins/tern/plugin.json",
	"plugins/plugins/workflow/plugin.json",
	"plugins/plugins/agent-variants/plugin.json",
	"tools/lint.sh",
];
const MISSING_ROOT = `the workspace: ${ROOT} is missing; the workspace keeps one, with an entry under [Unreleased]`;
const MISSING_TERN = `plugin tern: ${TERN} is missing; a plugin keeps one while its folder has files, with an entry under [Unreleased]`;

describe("ownerOf", () => {
	test("plugin folders own their files, the public repo the rest of plugins/, the workspace the rest", () => {
		expect(ownerOf("plugins/plugins/tern/src/index.ts")).toBe(TERN);
		expect(ownerOf("plugins/plugins/tern/CHANGELOG.md")).toBe(TERN);
		expect(ownerOf("plugins/plugins/README.md")).toBe(PUBLIC);
		expect(ownerOf("plugins/tools/build.ts")).toBe(PUBLIC);
		expect(ownerOf("plugins/catalog.json")).toBe(PUBLIC);
		expect(ownerOf("plugins/CHANGELOG.md")).toBe(PUBLIC);
		expect(ownerOf("plugins")).toBe(ROOT);
		expect(ownerOf("tools/lint.sh")).toBe(ROOT);
		expect(ownerOf("config/install.sh")).toBe(ROOT);
		expect(ownerOf("CHANGELOG.md")).toBe(ROOT);
	});
});

interface Case {
	name: string;
	changes: Change[];
	staged: Record<string, string>;
	optedOut?: boolean;
	errors: string[];
}

const parent = reader({
	[ROOT]: log("old"),
	[TERN]: log("old"),
	[WORKFLOW]: log(),
	[VARIANTS]: "## [x]\n",
	[PUBLIC]: log("old"),
});

/** Runs each case on a commit whose index holds OTHER, less what it deletes, and what it adds or stages. */
function run(cases: Case[]): void {
	for (const c of cases) {
		test(c.name, async () => {
			const deleted = new Set(c.changes.filter(ch => ch.status === "D").map(ch => ch.path));
			const added = c.changes.filter(ch => ch.status !== "D").map(ch => ch.path);
			const paths = [...new Set([...OTHER.filter(p => !deleted.has(p)), ...added, ...Object.keys(c.staged)])];
			const commit = {
				changes: c.changes,
				paths,
				parent,
				staged: reader(c.staged),
				optedOut: c.optedOut ?? false,
				touched: new Map<string, Date>(),
				now: new Date(),
			};
			expect(await missingEntries(commit)).toEqual(c.errors);
		});
	}
}

describe("missingEntries: the public repo's changelog", () => {
	run([
		{
			name: "public repo tooling change with an entry there",
			changes: [M("plugins/tools/build.ts"), M(PUBLIC)],
			staged: { [PUBLIC]: log("old", "new") },
			errors: [],
		},
		{
			name: "public repo tooling change with a root entry only",
			changes: [M("plugins/tools/build.ts"), M(ROOT)],
			staged: { [ROOT]: log("old", "new"), [PUBLIC]: log("old") },
			errors: [`the public repo: no new entry under [Unreleased] in ${PUBLIC}`],
		},
		{
			name: "config change with a public repo entry only",
			changes: [M("config/install.sh"), M(PUBLIC)],
			staged: { [PUBLIC]: log("old", "new"), [ROOT]: log("old") },
			errors: [`the workspace: no new entry under [Unreleased] in ${ROOT}`],
		},
		{
			name: "public repo changelog deleted",
			changes: [D(PUBLIC)],
			staged: {},
			errors: [`the public repo: ${PUBLIC} is missing; the public repo keeps one, with an entry under [Unreleased]`],
		},
	]);
});

describe("staleMonths", () => {
	const [september, october] = [new Date(2026, 8, 15), new Date(2026, 9, 2)];
	const afterCut = `${log("new")}\n## [2026.09] - 2026-09-30\n\n### Added\n\n- old\n`;
	const cases: { name: string; staged: Record<string, string>; touched: Date; file?: string; errors: string[] }[] = [
		{
			name: "an entry added while Unreleased holds last month's",
			staged: { [ROOT]: log("old", "new") },
			touched: september,
			errors: [`${ROOT}: its Unreleased entries are from 2026.09; run just changelog-cut first`],
		},
		{
			name: "the same in the public repo's changelog",
			staged: { [PUBLIC]: log("old", "new") },
			touched: september,
			file: PUBLIC,
			errors: [`${PUBLIC}: its Unreleased entries are from 2026.09; run just changelog-cut first`],
		},
		{ name: "an entry added after the cut", staged: { [ROOT]: afterCut }, touched: september, errors: [] },
		{ name: "the cut alone", staged: { [ROOT]: afterCut.replace("- new\n", "") }, touched: september, errors: [] },
		{
			name: "an entry added in the same month",
			staged: { [ROOT]: log("old", "new") },
			touched: new Date(2026, 9, 1),
			errors: [],
		},
		{ name: "no entry added", staged: { [ROOT]: log("old") }, touched: september, errors: [] },
	];
	for (const c of cases) {
		test(c.name, async () => {
			const staged = reader({ [ROOT]: log("old"), [PUBLIC]: log("old"), ...c.staged });
			const touched = new Map([[c.file ?? ROOT, c.touched]]);
			const commit = { changes: [], paths: OTHER, parent, staged, optedOut: false, touched, now: october };
			expect(await staleMonths(commit)).toEqual(c.errors);
		});
	}
});

describe("missingEntries: entries", () => {
	run([
		{
			name: "plugin change with an entry",
			changes: [M("plugins/plugins/tern/src/a.ts"), M(TERN)],
			staged: { [TERN]: log("old", "new") },
			errors: [],
		},
		{
			name: "plugin change without an entry",
			changes: [M("plugins/plugins/tern/src/a.ts")],
			staged: { [TERN]: log("old") },
			errors: [`plugin tern: no new entry under [Unreleased] in ${TERN}`],
		},
		{
			name: "workspace change without an entry",
			changes: [M("tools/lint.sh")],
			staged: { [ROOT]: log("old") },
			errors: [`the workspace: no new entry under [Unreleased] in ${ROOT}`],
		},
		{ name: "changelog-only change", changes: [M(TERN)], staged: { [TERN]: log() }, errors: [] },
		{
			name: "two things changed, one entry",
			changes: [M("plugins/plugins/tern/src/a.ts"), M(TERN), M("tools/lint.sh")],
			staged: { [TERN]: log("old", "new"), [ROOT]: log("old") },
			errors: [`the workspace: no new entry under [Unreleased] in ${ROOT}`],
		},
		{
			name: "an entry removed, none added",
			changes: [M("plugins/plugins/tern/src/a.ts"), M(TERN)],
			staged: { [TERN]: log() },
			errors: [`plugin tern: no new entry under [Unreleased] in ${TERN}`],
		},
		{
			name: "an entry edited",
			changes: [M("plugins/plugins/tern/src/a.ts"), M(TERN)],
			staged: { [TERN]: log("old, reworded") },
			errors: [],
		},
		{
			name: "entry under a release, not Unreleased",
			changes: [M("plugins/plugins/workflow/rules/a.md"), M(WORKFLOW)],
			staged: { [WORKFLOW]: `${log()}\n## [0.1.0] - 2026-01-01\n\n### Added\n\n- new\n` },
			errors: [`plugin workflow: no new entry under [Unreleased] in ${WORKFLOW}`],
		},
		{
			name: "new plugin with its changelog",
			changes: [A("plugins/plugins/demo/plugin.json"), A("plugins/plugins/demo/CHANGELOG.md")],
			staged: { "plugins/plugins/demo/CHANGELOG.md": log("first") },
			errors: [],
		},
		{
			name: "opted out: no entry needed",
			changes: [M("plugins/plugins/tern/src/a.ts"), M("tools/lint.sh")],
			staged: { [TERN]: log("old"), [ROOT]: log("old") },
			optedOut: true,
			errors: [],
		},
		{
			name: "entry under an undated versioned heading",
			changes: [M("plugins/plugins/tern/src/a.ts"), M(TERN)],
			staged: { [TERN]: `${log("old")}\n## [1.1.0] - Unreleased\n\n### Added\n\n- new\n` },
			errors: [`plugin tern: ${TERN}: release 1.1.0 has no date; write "## [<version>] - YYYY-MM-DD"`],
		},
		{
			name: "entry under a second Unreleased section",
			changes: [M("plugins/plugins/tern/src/a.ts"), M(TERN)],
			staged: { [TERN]: `${log("old")}\n## Unreleased\n\n### Added\n\n- new\n` },
			errors: [`plugin tern: ${TERN}: has 2 Unreleased sections; keep one`],
		},
		{
			name: "staged changelog doesn't parse",
			changes: [M("plugins/plugins/tern/src/a.ts"), M(TERN)],
			staged: { [TERN]: "# Changelog\n\n## Next\n\n- a\n" },
			errors: [
				`plugin tern: ${TERN}: not in Keep a Changelog format: Parse error in the line 5: Syntax error in the release title`,
			],
		},
		{
			name: "parent's changelog doesn't parse: every staged entry is new",
			changes: [M("plugins/plugins/agent-variants/src/a.ts"), M(VARIANTS)],
			staged: { [VARIANTS]: log("fixed it") },
			errors: [],
		},
	]);
});

describe("missingEntries: required changelogs", () => {
	run([
		{
			name: "new plugin without a changelog",
			changes: [A("plugins/plugins/demo/plugin.json")],
			staged: {},
			errors: [
				"plugin demo: plugins/plugins/demo/CHANGELOG.md is missing; a plugin keeps one while its folder has files, with an entry under [Unreleased]",
			],
		},
		{ name: "root changelog deleted", changes: [D(ROOT)], staged: {}, errors: [MISSING_ROOT] },
		{
			name: "root changelog deleted, opted out",
			changes: [D(ROOT), M("tools/lint.sh")],
			staged: {},
			optedOut: true,
			errors: [MISSING_ROOT],
		},
		{
			name: "root changelog renamed to another case",
			changes: [D(ROOT), A("changelog.md")],
			staged: { "changelog.md": log("old", "new") },
			errors: [MISSING_ROOT],
		},
		{ name: "plugin changelog deleted, folder kept", changes: [D(TERN)], staged: {}, errors: [MISSING_TERN] },
		{
			name: "plugin changelog renamed to another case",
			changes: [D(TERN), A("plugins/plugins/tern/CHANGELOG.MD")],
			staged: { "plugins/plugins/tern/CHANGELOG.MD": log("old", "new") },
			errors: [MISSING_TERN],
		},
		{
			name: "plugin removed with its changelog",
			changes: [D("plugins/plugins/tern/plugin.json"), D(TERN)],
			staged: {},
			errors: [],
		},
	]);
});
