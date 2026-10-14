import { afterEach, describe, expect, test } from "bun:test";
import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { CATALOG, cleanup, problems, put, SETTINGS, tree } from "./fixtures";
import { isObject } from "./json";
import { build, check } from "./output";

afterEach(cleanup);

const AT = "plugins/demo/core/settings.json";

/** A tree whose plugin demo has the program demo and `declared` as its core/settings.json. */
async function withSetting(hosts: string[], declared: unknown = SETTINGS): Promise<string> {
	const root = await tree(hosts);
	await put(root, "catalog.json", {
		...CATALOG,
		plugins: [{ name: "demo", category: "development", hosts, program: "demo" }],
	});
	await put(root, "cmd/demo/main.go", "package main\n");
	await put(root, AT, declared);
	return root;
}

/** SETTINGS with its setting `mode` changed by `change`. */
function withMode(change: (mode: Record<string, unknown>) => void): unknown {
	const declared = structuredClone(SETTINGS);
	change(declared.settings.mode);
	return declared;
}

async function generated(root: string, rel: string): Promise<unknown> {
	return JSON.parse(await readFile(join(root, "plugins/demo", rel), "utf8"));
}

describe("settings in each agent's own settings", () => {
	test("Claude Code gets userConfig for the settings, not the secrets", async () => {
		const root = await withSetting(["claude"]);
		expect(await problems(root)).toEqual([]);
		await build(root);
		const manifest = await generated(root, ".claude-plugin/plugin.json");
		expect(manifest).toMatchObject({
			userConfig: {
				mode: {
					type: "string",
					title: "Mode",
					// oxlint-disable-next-line typescript/no-unsafe-assignment -- bun:test types asymmetric matchers as any
					description: expect.stringMatching(
						/^How much the agent relies on this\. .*"only": Only this\. Nothing else\./,
					),
					options: ["shared", "only", "first"],
					default: "shared",
				},
			},
		});
		expect(manifest).not.toHaveProperty(["userConfig", "token"]);
	});

	test("omp gets omp.settings in package.json, beside its own fields", async () => {
		const root = await withSetting(["omp"]);
		await put(root, "plugins/demo/package.json", { name: "demo", omp: { extensions: ["./src/index.ts"] } });
		await build(root);
		expect(await generated(root, "package.json")).toMatchObject({
			omp: {
				extensions: ["./src/index.ts"],
				settings: { mode: { type: "enum", values: ["shared", "only", "first"], default: "shared" } },
			},
		});
	});

	test("a plugin without settings has none in its manifests", async () => {
		const root = await tree(["claude", "omp"]);
		await put(root, "plugins/demo/package.json", { name: "demo", omp: { extensions: [], settings: { stale: {} } } });
		await build(root);
		expect(await generated(root, ".claude-plugin/plugin.json")).not.toHaveProperty("userConfig");
		expect(await generated(root, "package.json")).toEqual({
			name: "demo",
			version: "1.0.0",
			description: "Demo plugin",
			omp: { extensions: [] },
		});
	});

	test("the shells' code and the Go program's copy carry the declaration, and go with it", async () => {
		const root = await withSetting(["omp"]);
		await put(root, AT, { $schema: "../../../tools/settings.schema.json", ...SETTINGS });
		await cp(join(import.meta.dir, "../../kit/core"), join(root, "kit/core"), { recursive: true });
		await put(root, "plugins/demo/src/index.ts", "export {};\n");
		await build(root);
		expect(JSON.parse(await readFile(join(root, "cmd/demo/settings.gen.json"), "utf8"))).toEqual(SETTINGS);
		const gen = join(root, "plugins/demo/core/settings.gen.ts");
		const run = Bun.spawnSync([
			process.execPath,
			"-e",
			`import { declared } from ${JSON.stringify(gen)}; console.log(JSON.stringify(declared));`,
		]);
		expect(JSON.parse(run.stdout.toString())).toEqual(SETTINGS);
		await rm(join(root, AT));
		expect(await check(root)).toEqual([
			"unexpected: schemas/settings.schema.json",
			"unexpected: plugins/demo/core/settings.gen.ts",
			"unexpected: cmd/demo/settings.gen.json",
		]);
	});

	test("the settings files' schema takes declared values in each plugin's section, and nothing else", async () => {
		const folder = { type: "path", title: "Folder", about: "Where threads are kept.", default: ".threads" };
		const root = await withSetting(["omp"], { ...SETTINGS, settings: { ...SETTINGS.settings, folder } });
		await build(root);
		const schema: unknown = JSON.parse(await readFile(join(root, "schemas/settings.schema.json"), "utf8"));
		const validate = new Ajv2020({ strict: false }).compile(isObject(schema) ? schema : {});
		const ok = (file: unknown) => validate(file);
		expect(ok({ $schema: "x", demo: { mode: "only", folder: "notes" } })).toBe(true);
		expect(ok({ demo: { mode: "never" } })).toBe(false);
		expect(ok({ demo: { token: "s3cret" } })).toBe(false);
		expect(ok({ demo: { colour: "red" } })).toBe(false);
		expect(ok({ other: {} })).toBe(false);
	});

	test("a text or a path is a string, empty by default: empty follows the shared one", async () => {
		const folder = { type: "path", title: "Folder", about: "Where threads are kept.", default: ".threads" };
		const root = await withSetting(["claude", "omp"], { settings: { folder } });
		await put(root, "plugins/demo/package.json", { name: "demo", omp: { extensions: [] } });
		expect(await problems(root)).toEqual([]);
		await build(root);
		const said =
			"Where threads are kept. Empty (the default here): as your piebird settings files say (~/.agents/piebird/settings.json, and a project's .agents/piebird/settings.json), which every agent reads.";
		expect(await generated(root, ".claude-plugin/plugin.json")).toMatchObject({
			userConfig: { folder: { type: "string", title: "Folder", description: said, default: "" } },
		});
		expect(await generated(root, "package.json")).toMatchObject({
			omp: { settings: { folder: { type: "string", description: said, default: "" } } },
		});
	});
});

describe("setting declarations", () => {
	test.each([
		[
			"a missing title",
			withMode(mode => {
				delete mode.title;
			}),
			[`${AT}: /settings/mode must have required property 'title'`],
		],
		[
			"a default that isn't a choice",
			withMode(mode => {
				mode.default = "never";
			}),
			[`${AT}: /settings/mode/default "never" isn't one of the choices`],
		],
		[
			"a repeated choice",
			withMode(mode => {
				mode.choices = [SETTINGS.settings.mode.choices[1], SETTINGS.settings.mode.choices[1]];
			}),
			[`${AT}: /settings/mode/choices repeats a value`],
		],
		[
			"an env var name that isn't one",
			{ ...SETTINGS, secrets: { token: { ...SETTINGS.secrets.token, env: "demo token" } } },
			[`${AT}: /secrets/token/env must match pattern "^[A-Z][A-Z0-9_]*$"`],
		],
		[
			"a key both a setting and a secret",
			{ ...SETTINGS, secrets: { mode: SETTINGS.secrets.token } },
			[`${AT}: "mode" is both a setting and a secret`],
		],
		[
			"a setting of no kind",
			withMode(mode => {
				delete mode.type;
			}),
			[
				`${AT}: /settings/mode must have required property 'type'`,
				`${AT}: /settings/mode tag "type" must be string`,
			],
		],
		[
			"a text with choices",
			withMode(mode => {
				mode.type = "text";
			}),
			[`${AT}: /settings/mode must NOT have additional properties: "choices"`],
		],
	])("%s is refused", async (_name, declared, expected) => {
		expect(await problems(await withSetting(["claude"], declared))).toEqual(expected);
	});
});
