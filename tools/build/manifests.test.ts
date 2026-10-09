import { afterEach, describe, expect, test } from "bun:test";
import catalogSchema from "../catalog.schema.json" with { type: "json" };
import { type Case, CATALOG, cleanup, MANIFEST, plainPlugin, problems, put, tree } from "./fixtures";
import { HOSTS, MCP_SCHEMA, PLUGIN_SCHEMA } from "./schemas";

afterEach(cleanup);

const P = "plugins/demo/plugin.json:";

describe("plugin.json", () => {
	const cases: Case[] = [
		{
			name: "every field ok",
			value: {
				...MANIFEST,
				author: { name: "A", email: "a@example.com", url: "https://example.com" },
				homepage: "https://example.com",
				repository: "https://example.com/r",
				license: "MIT",
				keywords: ["a"],
			},
		},
		{
			name: "unknown key",
			value: { ...MANIFEST, main: "index.js" },
			errors: [`${P} must NOT have additional properties: "main"`],
			by: "schema",
		},
		{
			name: "unknown author key",
			value: { ...MANIFEST, author: { name: "A", twitter: "@a" } },
			errors: [`${P} /author must NOT have additional properties: "twitter"`],
			by: "schema",
		},
		{
			name: "author name not a string",
			value: { ...MANIFEST, author: { name: 1 } },
			errors: [`${P} /author/name must be string`],
			by: "schema",
		},
		{
			name: "keywords not strings",
			value: { ...MANIFEST, keywords: [1] },
			errors: [`${P} /keywords/0 must be string`],
			by: "schema",
		},
		{
			name: "wrong $schema",
			value: { ...MANIFEST, $schema: MCP_SCHEMA },
			errors: [`${P} /$schema must be equal to constant: "${PLUGIN_SCHEMA}"`],
			by: "schema",
		},
		{
			name: "no $schema",
			value: { name: "demo", version: "1.0.0", description: "Demo plugin" },
			errors: [`${P} must have required property '$schema'`],
			by: "schema",
		},
		{
			name: "name against the spec",
			value: { ...MANIFEST, name: "Demo" },
			errors: [
				`${P} /name must match pattern "^(?!.*(?:--|\\.\\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$"`,
				`${P} /name must match pattern "^(?!.*(?:claude|anthropic))[a-z0-9]+(?:-[a-z0-9]+)*$"`,
				`${P} /name must equal the directory name "demo"`,
			],
			by: "schema",
		},
		{
			name: "name with a period (the spec allows it, the cross-host rule doesn't)",
			value: { ...MANIFEST, name: "de.mo" },
			errors: [
				`${P} /name must match pattern "^(?!.*(?:claude|anthropic))[a-z0-9]+(?:-[a-z0-9]+)*$"`,
				`${P} /name must equal the directory name "demo"`,
			],
			by: "prose",
		},
		{
			name: "name with claude",
			value: { ...MANIFEST, name: "claude-demo" },
			errors: [
				`${P} /name must match pattern "^(?!.*(?:claude|anthropic))[a-z0-9]+(?:-[a-z0-9]+)*$"`,
				`${P} /name must equal the directory name "demo"`,
			],
			by: "prose",
		},
		{
			name: "name not the directory",
			value: { ...MANIFEST, name: "other" },
			errors: [`${P} /name must equal the directory name "demo"`],
			by: "prose",
		},
		{
			name: "no version",
			value: { $schema: PLUGIN_SCHEMA, name: "demo", description: "Demo plugin" },
			errors: [`${P} /version is required and must not be blank`],
			by: "prose",
		},
		{
			name: "blank description",
			value: { ...MANIFEST, description: " " },
			errors: [`${P} /description is required and must not be blank`],
			by: "prose",
		},
		{
			name: "extensions",
			value: { ...MANIFEST, extensions: { "com.example": {} } },
			errors: [`${P} /extensions is not supported by this build`],
			by: "prose",
		},
	];
	for (const c of cases) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			await put(root, "plugins/demo/plugin.json", c.value);
			expect(await problems(root)).toEqual(c.errors ?? []);
			expect(plainPlugin(c.value)).toBe(c.by !== "schema");
		});
	}
});

describe("catalog.json", () => {
	const NAME = 'must match pattern "^(?!.*(?:claude|anthropic))[a-z0-9]+(?:-[a-z0-9]+)*$"';
	const entry = { name: "demo", category: "development", hosts: ["omp"] };
	const cases: Case[] = [
		{ name: "ok", value: CATALOG },
		{ name: "every host ok", value: { ...CATALOG, plugins: [{ ...entry, hosts: ["omp", "claude", "codex"] }] } },
		{
			name: "unknown key",
			value: { ...CATALOG, version: "1" },
			errors: ['catalog.json: must NOT have additional properties: "version"'],
		},
		{
			name: "no owner",
			value: { ...CATALOG, owner: undefined },
			errors: ["catalog.json: must have required property 'owner'"],
		},
		{
			name: "unknown owner key",
			value: { ...CATALOG, owner: { name: "A", site: "x" } },
			errors: ['catalog.json: /owner must NOT have additional properties: "site"'],
		},
		{
			name: "blank description",
			value: { ...CATALOG, description: "" },
			errors: ['catalog.json: /description must match pattern "\\S"'],
		},
		{
			name: "name with anthropic",
			value: { ...CATALOG, name: "anthropic-tools" },
			errors: [`catalog.json: /name ${NAME}`],
		},
		{
			name: "unknown entry key",
			value: { ...CATALOG, plugins: [{ ...entry, source: "./x" }] },
			errors: ['catalog.json: /plugins/0 must NOT have additional properties: "source"'],
		},
		{
			name: "unknown host",
			value: { ...CATALOG, plugins: [{ ...entry, hosts: ["cursor"] }] },
			errors: [
				'catalog.json: /plugins/0/hosts/0 must be equal to one of the allowed values: "omp", "claude", "codex"',
			],
		},
		{
			name: "no hosts",
			value: { ...CATALOG, plugins: [{ ...entry, hosts: [] }] },
			errors: ["catalog.json: /plugins/0/hosts must NOT have fewer than 1 items"],
		},
		{
			name: "duplicate host",
			value: { ...CATALOG, plugins: [{ ...entry, hosts: ["omp", "omp"] }] },
			errors: ["catalog.json: /plugins/0/hosts must NOT have duplicate items (items ## 0 and 1 are identical)"],
		},
		{
			name: "duplicate entry",
			value: { ...CATALOG, plugins: [entry, entry] },
			errors: ['catalog.json: /plugins/1/name duplicates plugin "demo"'],
		},
		{
			name: "entry without a plugin folder",
			value: { ...CATALOG, plugins: [entry, { ...entry, name: "gone" }] },
			errors: ['catalog.json: /plugins/1/name "gone" has no plugins/gone/ folder'],
		},
		{
			name: "plugin folder not listed",
			value: { ...CATALOG, plugins: [] },
			errors: ["plugins/demo/: not listed in catalog.json; add an entry or remove the folder"],
		},
	];
	for (const c of cases) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			await put(root, "catalog.json", c.value);
			expect(await problems(root)).toEqual(c.errors ?? []);
		});
	}

	test("schema hosts are the hosts build.ts generates for", () => {
		expect(catalogSchema.properties.plugins.items.properties.hosts.items.enum).toEqual([...HOSTS]);
	});
});

describe("SKILL.md frontmatter", () => {
	const F = "plugins/demo/skills/demo/SKILL.md frontmatter:";
	const cases: (Case & { value: string })[] = [
		{
			name: "every field ok",
			value: "name: demo\ndescription: Does demo things\nlicense: MIT\ncompatibility: Needs git\nmetadata:\n  version: '1.0'\nallowed-tools: Read Bash(git:*)",
		},
		{
			name: "unknown key",
			value: "name: demo\ndescription: Does demo things\nenabled: true",
			errors: [`${F} must NOT have additional properties: "enabled"`],
		},
		{ name: "no description", value: "name: demo", errors: [`${F} must have required property 'description'`] },
		{
			name: "description over 1024",
			value: `name: demo\ndescription: ${"x".repeat(1025)}`,
			errors: [`${F} /description must NOT have more than 1024 characters`],
		},
		{
			name: "compatibility over 500",
			value: `name: demo\ndescription: d\ncompatibility: ${"x".repeat(501)}`,
			errors: [`${F} /compatibility must NOT have more than 500 characters`],
		},
		{
			name: "metadata value not a string",
			value: "name: demo\ndescription: d\nmetadata:\n  version: 1.0",
			errors: [`${F} /metadata/version must be string`],
		},
		{
			name: "name not the directory",
			value: "name: other\ndescription: d",
			errors: [`${F} /name must equal the skill directory name "demo" (Agent Skills)`],
		},
		{
			name: "name with consecutive hyphens",
			value: "name: de--mo\ndescription: d",
			errors: [
				`${F} /name must match pattern "^[a-z0-9]+(-[a-z0-9]+)*$"`,
				`${F} /name must equal the skill directory name "demo" (Agent Skills)`,
			],
		},
	];
	for (const c of cases) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			await put(root, "plugins/demo/skills/demo/SKILL.md", `---\n${c.value}\n---\n\nBody\n`);
			expect(await problems(root)).toEqual(c.errors ?? []);
		});
	}

	test("no frontmatter", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/demo/skills/demo/SKILL.md", "# Demo\n");
		expect(await problems(root)).toEqual([
			'plugins/demo/skills/demo/SKILL.md: must start with YAML frontmatter between "---" lines',
		]);
	});
});
