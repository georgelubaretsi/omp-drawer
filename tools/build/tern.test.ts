import { afterEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, problems, put, tree } from "./fixtures";
import { TERN_DIR } from "./tern";

afterEach(cleanup);

const TOML = 'schema = 1\nid = "demo"\nversion = "1.0.0"\nwindow = "window.luau"\n';
const PART = `plugins/demo/${TERN_DIR}`;

describe("Tern parts", () => {
	test("a plugin with the tern and omp hosts and a matching so.stencil.tern/plugin.toml passes", async () => {
		const root = await tree(["omp", "tern"]);
		await put(root, `${PART}/plugin.toml`, TOML);
		expect(await problems(root)).toEqual([]);
	});

	test("the tern host needs the omp host, which installs the part", async () => {
		const root = await tree(["tern"]);
		await put(root, `${PART}/plugin.toml`, TOML);
		expect(await problems(root)).toEqual([
			'catalog.json: /plugins/0/hosts/0 must be equal to constant: "omp"',
			"catalog.json: /plugins/0/hosts must contain at least 1 valid item(s)",
			'catalog.json: /plugins/0 must match "then" schema',
		]);
	});

	test("the tern host needs the folder, and the folder needs the tern host", async () => {
		const without = await tree(["omp", "tern"]);
		expect(await problems(without)).toEqual([
			`${PART}/plugin.toml: missing; the tern host needs the plugin's Tern part`,
		]);
		const unlisted = await tree(["omp"]);
		await put(unlisted, `${PART}/plugin.toml`, TOML);
		expect(await problems(unlisted)).toEqual([
			`${PART}/: only a plugin with the tern host has one; add "tern" to its hosts in catalog.json`,
		]);
	});

	test("plugin.toml carries the plugin's name as id and plugin.json's version", async () => {
		const root = await tree(["omp", "tern"]);
		await put(root, `${PART}/plugin.toml`, 'schema = 1\nid = "other"\nversion = "0.9.0"\nwindow = "w.luau"\n');
		expect(await problems(root)).toEqual([
			`${PART}/plugin.toml: id must be the plugin's name "demo"`,
			`${PART}/plugin.toml: version must be plugin.json's "1.0.0"`,
		]);
	});

	test("a folder without plugin.toml, a case variant, and broken TOML are reported", async () => {
		const empty = await tree(["omp", "tern"]);
		await mkdir(join(empty, PART), { recursive: true });
		expect(await problems(empty)).toEqual([`${PART}/plugin.toml: missing; Tern loads a plugin from its plugin.toml`]);
		const cased = await tree(["omp", "tern"]);
		await put(cased, `${PART}/Plugin.toml`, TOML);
		expect((await problems(cased))[0]).toBe(
			`${PART}/Plugin.toml: must be named exactly plugin.toml; case-sensitive filesystems won't find it`,
		);
		const broken = await tree(["omp", "tern"]);
		await put(broken, `${PART}/plugin.toml`, "id = ");
		expect((await problems(broken))[0]).toStartWith(`${PART}/plugin.toml: not valid TOML: `);
	});
});
