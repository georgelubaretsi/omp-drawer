import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, problems, put, tree } from "./fixtures";
import { ValidationError } from "./json";
import { build } from "./output";
import { MCP_SCHEMA, PLUGIN_SCHEMA } from "./schemas";

afterEach(cleanup);

describe("skill folders", () => {
	const F = "plugins/demo/skills";
	const VALID = "---\nname: demo\ndescription: d\n---\n";
	const cases: { name: string; files: Record<string, string>; errors: string[] }[] = [
		{ name: "a folder without SKILL.md is not a skill", files: { "notes/README.md": "# Notes\n" }, errors: [] },
		{ name: "an empty folder is not a skill", files: { "empty/.keep": "" }, errors: [] },
		{ name: "a file directly under skills/ is ignored", files: { "README.md": "# Skills\n" }, errors: [] },
		{
			name: "skill.md in lower case",
			files: { "demo/skill.md": VALID },
			errors: [`${F}/demo/skill.md: must be named exactly SKILL.md; case-sensitive filesystems won't find it`],
		},
		{
			name: "Skill.MD in mixed case",
			files: { "demo/Skill.MD": VALID },
			errors: [`${F}/demo/Skill.MD: must be named exactly SKILL.md; case-sensitive filesystems won't find it`],
		},
		{ name: "SKILL.md.bak is not SKILL.md and is ignored", files: { "demo/SKILL.md.bak": VALID }, errors: [] },
		{
			name: "SKILL.md that is a folder",
			files: { "demo/SKILL.md/x": "" },
			errors: [`${F}/demo/SKILL.md: must be a regular file (Agent Plugins §6.2)`],
		},
		{
			name: "skills/node_modules is not part of the package and is skipped",
			files: { "node_modules/SKILL.md": "not a skill\n" },
			errors: [],
		},
	];
	for (const c of cases) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			for (const [rel, text] of Object.entries(c.files)) await put(root, `${F}/${rel}`, text);
			expect(await problems(root)).toEqual(c.errors);
		});
	}
});

describe("fixed file names match exactly", () => {
	const MSG = "must be named exactly";
	const WHY = "case-sensitive filesystems won't find it";
	test("Plugin.json", async () => {
		const root = await tree(["omp"]);
		await rename(join(root, "plugins/demo/plugin.json"), join(root, "plugins/demo/Plugin.json"));
		expect(await problems(root)).toEqual([
			`plugins/demo/Plugin.json: ${MSG} plugin.json; ${WHY}`,
			"plugins/demo/plugin.json: missing; add it or remove the folder",
		]);
	});

	test("MCP.json", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/demo/MCP.json", { $schema: MCP_SCHEMA, mcpServers: {} });
		expect(await problems(root)).toEqual([`plugins/demo/MCP.json: ${MSG} mcp.json; ${WHY}`]);
	});

	test("Package.json", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/demo/Package.json", { name: "x" });
		expect(await problems(root)).toEqual([`plugins/demo/Package.json: ${MSG} package.json; ${WHY}`]);
	});

	test("Skills/", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/demo/Skills/demo/SKILL.md", "---\nname: demo\ndescription: d\n---\n");
		expect(await problems(root)).toEqual([`plugins/demo/Skills: ${MSG} skills; ${WHY}`]);
	});
});

describe("repeated keys", () => {
	const owner = `"owner":{"name":"Someone"},"description":"Test catalog"`;
	const entry = `{"name":"demo","category":"development","hosts":["omp"]}`;
	const cases: { name: string; file: string; text: string; errors: string[] }[] = [
		{
			name: "catalog.json top level",
			file: "catalog.json",
			text: `{"name":"demo-market","name":"demo-market",${owner},"plugins":[${entry}]}`,
			errors: ['catalog.json: duplicate key "name"'],
		},
		{
			name: "catalog.json entry",
			file: "catalog.json",
			text: `{"name":"demo-market",${owner},"plugins":[{"name":"demo","category":"development","category":"development","hosts":["omp"]}]}`,
			errors: ['catalog.json: /plugins/0 duplicate key "category"'],
		},
		{
			name: "plugin.json",
			file: "plugins/demo/plugin.json",
			text: `{"$schema":"${PLUGIN_SCHEMA}","name":"demo","version":"1.0.0","description":"Demo plugin","version":"1.0.0"}`,
			errors: ['plugins/demo/plugin.json: duplicate key "version"'],
		},
		{
			name: "plugin.json key spelled with an escape",
			file: "plugins/demo/plugin.json",
			text: `{"$schema":"${PLUGIN_SCHEMA}","name":"demo","n\\u0061me":"demo","version":"1.0.0","description":"Demo plugin"}`,
			errors: ['plugins/demo/plugin.json: duplicate key "name"'],
		},
		{
			name: "mcp.json server left by a merge",
			file: "plugins/demo/mcp.json",
			text: `{"$schema":"${MCP_SCHEMA}","mcpServers":{"s":{"type":"stdio","command":"uvx"},"s":{"type":"stdio","command":"uvx"}}}`,
			errors: ['plugins/demo/mcp.json: /mcpServers duplicate key "s"'],
		},
		{
			name: "mcp.json env",
			file: "plugins/demo/mcp.json",
			text: `{"$schema":"${MCP_SCHEMA}","mcpServers":{"s":{"type":"stdio","command":"uvx","env":{"A":"1","A":"2"}}}}`,
			errors: ['plugins/demo/mcp.json: /mcpServers/s/env duplicate key "A"'],
		},
		{
			name: "package.json",
			file: "plugins/demo/package.json",
			text: `{"name":"demo-pkg","version":"1.0.0","description":"Demo plugin","version":"1.0.0"}`,
			errors: ['plugins/demo/package.json: duplicate key "version"'],
		},
		{
			name: "SKILL.md frontmatter",
			file: "plugins/demo/skills/demo/SKILL.md",
			text: "---\nname: demo\ndescription: d\nname: demo\n---\n",
			errors: ['plugins/demo/skills/demo/SKILL.md frontmatter: duplicate key "name"'],
		},
		{
			name: "SKILL.md frontmatter metadata",
			file: "plugins/demo/skills/demo/SKILL.md",
			text: "---\nname: demo\ndescription: d\nmetadata:\n  a: '1'\n  a: '2'\n---\n",
			errors: ['plugins/demo/skills/demo/SKILL.md frontmatter: /metadata duplicate key "a"'],
		},
		{
			name: "same name in different objects is fine",
			file: "plugins/demo/mcp.json",
			text: `{"$schema":"${MCP_SCHEMA}","mcpServers":{"a":{"type":"stdio","command":"uvx","env":{"X":"1"}},"b":{"type":"stdio","command":"uvx","env":{"X":"1"}}}}`,
			errors: [],
		},
		{
			name: "invalid JSON still reported by the parser",
			file: "plugins/demo/plugin.json",
			text: `{"name": }`,
			errors: ["plugins/demo/plugin.json: invalid JSON: Unexpected token RBrace found. (1:10)"],
		},
	];
	for (const c of cases) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			await put(root, c.file, c.text);
			expect(await problems(root)).toEqual(c.errors);
		});
	}
});

describe("plugin folders", () => {
	test("a folder left by a removed plugin is an error, and build leaves it alone", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/gone/.claude-plugin/plugin.json", { name: "gone" });
		await put(root, "plugins/gone/.mcp.json", { mcpServers: {} });
		expect(await problems(root)).toEqual([
			"plugins/gone/: not listed in catalog.json; add an entry or remove the folder",
			"plugins/gone/plugin.json: missing; add it or remove the folder",
		]);
		const error = await build(root).then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(ValidationError);
		expect(await readFile(join(root, "plugins/gone/.mcp.json"), "utf8")).toContain("mcpServers");
	});

	test("a listed folder without plugin.json", async () => {
		const root = await tree(["omp"]);
		await rm(join(root, "plugins/demo/plugin.json"));
		await put(root, "plugins/demo/README.md", "# Demo\n");
		expect(await problems(root)).toEqual(["plugins/demo/plugin.json: missing; add it or remove the folder"]);
	});

	test("a folder whose name differs from its entry only in case", async () => {
		const root = await tree(["omp"]);
		// Matched by exact name, so a case-insensitive filesystem doesn't make "Demo" pass as "demo".
		await rename(join(root, "plugins/demo"), join(root, "plugins/Demo"));
		expect(await problems(root)).toEqual([
			'catalog.json: /plugins/0/name "demo" has no plugins/demo/ folder',
			"plugins/Demo/: not listed in catalog.json; add an entry or remove the folder",
			'plugins/Demo/plugin.json: /name must equal the directory name "Demo"',
		]);
	});

	test("a plugin folder that is a plain file is ignored", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/README.md", "# Plugins\n");
		expect(await problems(root)).toEqual([]);
	});
});
