import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { join, posix, relative, win32 } from "node:path";
import { cleanup, link, problems, put, tree } from "./fixtures";
import { ValidationError } from "./json";
import { build, check } from "./output";
import { isOutside } from "./paths";

afterEach(cleanup);

describe("symlinks in plugin sources", () => {
	const L = "symlinks are not allowed in plugin sources";
	const cases: { name: string; setup: (root: string) => Promise<void>; errors: string[] }[] = [
		{
			name: "file link",
			setup: async root => {
				await put(root, "outside/server", "#!/bin/sh\n");
				await link(root, "outside/server", "plugins/demo/bin/server");
			},
			errors: [`plugins/demo/bin/server: ${L}`],
		},
		{
			name: "folder link",
			setup: async root => {
				await mkdir(join(root, "outside"));
				await link(root, "outside", "plugins/demo/data");
			},
			errors: [`plugins/demo/data: ${L}`],
		},
		{
			name: "dangling link",
			setup: root => link(root, "missing", "plugins/demo/data"),
			errors: [`plugins/demo/data: ${L}`],
		},
		{
			name: "link pointing inside the plugin",
			setup: async root => {
				await put(root, "plugins/demo/bin/server", "#!/bin/sh\n");
				await link(root, "plugins/demo/bin/server", "plugins/demo/bin/alias");
			},
			errors: [`plugins/demo/bin/alias: ${L}`],
		},
		{
			name: "symlinked package.json",
			setup: async root => {
				await put(root, "outside/package.json", { name: "x" });
				await link(root, "outside/package.json", "plugins/demo/package.json");
			},
			errors: [`plugins/demo/package.json: ${L}`],
		},
		{
			name: "symlinked SKILL.md",
			setup: async root => {
				await put(root, "outside/SKILL.md", "---\nname: demo\ndescription: d\n---\n");
				await link(root, "outside/SKILL.md", "plugins/demo/skills/demo/SKILL.md");
			},
			errors: [`plugins/demo/skills/demo/SKILL.md: ${L}`],
		},
		{
			name: "symlinked plugin folder",
			setup: async root => {
				await rename(join(root, "plugins/demo"), join(root, "elsewhere"));
				await link(root, "elsewhere", "plugins/demo");
			},
			errors: [`plugins/demo: ${L}`],
		},
		{
			name: "symlinked plugins folder",
			setup: async root => {
				await rename(join(root, "plugins"), join(root, "elsewhere"));
				await link(root, "elsewhere", "plugins");
			},
			errors: [`plugins: ${L}`],
		},
		{
			name: "every link reported, sorted",
			setup: async root => {
				await link(root, "missing", "plugins/demo/z");
				await link(root, "missing", "plugins/demo/a/b");
			},
			errors: [`plugins/demo/a/b: ${L}`, `plugins/demo/z: ${L}`],
		},
		{
			name: "links inside node_modules are allowed",
			setup: async root => {
				await mkdir(join(root, "elsewhere"));
				await link(root, "elsewhere", "plugins/demo/node_modules/pkg");
				await link(root, "elsewhere", "plugins/demo/src/node_modules/pkg");
			},
			errors: [],
		},
		{
			name: "a node_modules folder directly under plugins/ is walked",
			setup: async root => {
				await mkdir(join(root, "elsewhere"));
				await link(root, "elsewhere", "plugins/node_modules/pkg");
			},
			errors: [`plugins/node_modules/pkg: ${L}`],
		},
		{
			name: "a node_modules folder that is itself a link is reported",
			setup: async root => {
				await mkdir(join(root, "elsewhere"));
				await link(root, "elsewhere", "plugins/demo/node_modules");
			},
			errors: [`plugins/demo/node_modules: ${L}`],
		},
	];
	for (const c of cases) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			await c.setup(root);
			expect(await problems(root)).toEqual(c.errors);
		});
	}
});

/** Build and check both stop with exactly `errors`, and `outside` keeps exactly `entries`. */
async function expectStopped(root: string, errors: string[], outside: string, entries: string[]): Promise<void> {
	for (const run of [build, check]) {
		const error = await run(root).then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(ValidationError);
		expect(error instanceof ValidationError ? error.problems : []).toEqual(errors);
	}
	expect((await readdir(join(root, outside))).toSorted()).toEqual(entries);
}

describe("the build never writes through a link", () => {
	test("symlinked package.json: the target is not written", async () => {
		const root = await tree(["omp"]);
		await put(root, "outside/package.json", { name: "x" });
		await link(root, "outside/package.json", "plugins/demo/package.json");
		await expectStopped(root, ["plugins/demo/package.json: symlinks are not allowed in plugin sources"], "outside", [
			"package.json",
		]);
		expect(await readFile(join(root, "outside/package.json"), "utf8")).toBe('{\n  "name": "x"\n}\n');
	});

	test("symlinked generated folder in a plugin: nothing written into the target", async () => {
		const root = await tree(["claude"]);
		await mkdir(join(root, "outside"));
		await link(root, "outside", "plugins/demo/.claude-plugin");
		await expectStopped(
			root,
			["plugins/demo/.claude-plugin: symlinks are not allowed in plugin sources"],
			"outside",
			[],
		);
	});

	test("symlinked catalog folder at the root: nothing written into the target", async () => {
		const root = await tree(["claude"]);
		await mkdir(join(root, "outside"));
		await link(root, "outside", ".claude-plugin");
		await expectStopped(root, [".claude-plugin: symlinks are not allowed in generated paths"], "outside", []);
	});

	test("symlinked generated catalog file at the root: the target is not written", async () => {
		const root = await tree(["omp"]);
		await put(root, "outside/marketplace.json", "old\n");
		await link(root, "outside/marketplace.json", ".omp-plugin/marketplace.json");
		await expectStopped(
			root,
			[".omp-plugin/marketplace.json: symlinks are not allowed in generated paths"],
			"outside",
			["marketplace.json"],
		);
		expect(await readFile(join(root, "outside/marketplace.json"), "utf8")).toBe("old\n");
	});
});

describe("containment helper", () => {
	// Windows rows use path.win32.relative, so they run on any OS.
	const rows: [string, string, string, boolean][] = [
		["win32 child", "C:\\p\\demo", "C:\\p\\demo\\bin\\server", false],
		["win32 same folder", "C:\\p\\demo", "C:\\p\\demo", false],
		["win32 name starting with ..", "C:\\p\\demo", "C:\\p\\demo\\..foo", false],
		["win32 parent", "C:\\p\\demo", "C:\\p", true],
		["win32 sibling", "C:\\p\\demo", "C:\\p\\other\\x", true],
		["win32 other drive", "C:\\p\\demo", "D:\\p\\demo\\x", true],
		["win32 UNC share", "C:\\p\\demo", "\\\\server\\share\\x", true],
		["posix child", "/p/demo", "/p/demo/bin/server", false],
		["posix name starting with ..", "/p/demo", "/p/demo/..foo", false],
		["posix parent", "/p/demo", "/p", true],
		["posix sibling", "/p/demo", "/p/other/x", true],
	];
	for (const [name, from, to, outside] of rows) {
		const rel = name.startsWith("win32") ? win32.relative(from, to) : posix.relative(from, to);
		test(`${name}: ${JSON.stringify(rel)}`, () => {
			expect(isOutside(rel)).toBe(outside);
		});
	}

	test("the native path.relative agrees on this OS", () => {
		expect(isOutside(relative("/p/demo", "/p/demo/x"))).toBe(false);
		expect(isOutside(relative("/p/demo", "/p/other"))).toBe(true);
	});
});
