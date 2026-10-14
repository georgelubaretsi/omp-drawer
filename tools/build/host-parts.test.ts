import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, problems, put, tree } from "./fixtures";
import { build, check } from "./output";

afterEach(cleanup);

/** Each host's part folder, and the generated manifest that names its hooks file. */
const PARTS = [
	{ host: "claude", other: "codex", dir: "com.anthropic.claudecode", manifest: ".claude-plugin/plugin.json" },
	{ host: "codex", other: "claude", dir: "com.openai", manifest: ".codex-plugin/plugin.json" },
];
const HOOKS = { hooks: {} };

/** The generated file at rel in plugins/demo, parsed; undefined when there is none. */
async function generated(root: string, rel: string): Promise<unknown> {
	const text = await readFile(join(root, "plugins/demo", rel), "utf8").catch(() => undefined);
	return text === undefined ? undefined : JSON.parse(text);
}

describe.each(PARTS)("the $host part", ({ host, other, dir, manifest }) => {
	const part = `plugins/demo/${dir}`;
	const missing = `${part}/hooks/hooks.json: missing; the ${host} host loads the part from it`;

	test("its host's manifest names the hooks file, the other host's doesn't, and both go with the part", async () => {
		const root = await tree([host, other]);
		await put(root, `${part}/hooks/hooks.json`, HOOKS);
		expect(await problems(root)).toEqual([]);
		await build(root);
		expect(await generated(root, manifest)).toMatchObject({ name: "demo", hooks: `./${dir}/hooks/hooks.json` });
		expect(await generated(root, ".claude-plugin/plugin.json")).toMatchObject({ name: "demo" });
		if (host === "codex") expect(await generated(root, ".claude-plugin/plugin.json")).not.toHaveProperty("hooks");
		else expect(await generated(root, ".codex-plugin/plugin.json")).toBeUndefined();

		await rm(join(root, part), { recursive: true });
		await build(root);
		expect(await check(root)).toEqual([]);
		if (host === "codex") expect(await generated(root, manifest)).toBeUndefined();
		else expect(await generated(root, manifest)).not.toHaveProperty("hooks");
	});

	test("the folder needs its host", async () => {
		const root = await tree(["omp", other]);
		await put(root, `${part}/hooks/hooks.json`, HOOKS);
		expect(await problems(root)).toEqual([
			`${part}/: only a plugin with the ${host} host has one; add "${host}" to its hosts in catalog.json`,
		]);
	});

	test("the folder needs hooks/hooks.json, named exactly, as a file", async () => {
		const empty = await tree([host]);
		await mkdir(join(empty, part), { recursive: true });
		expect(await problems(empty)).toEqual([missing]);

		const noFile = await tree([host]);
		await mkdir(join(noFile, part, "hooks"), { recursive: true });
		expect(await problems(noFile)).toEqual([missing]);

		const cased = await tree([host]);
		await put(cased, `${part}/hooks/Hooks.json`, HOOKS);
		expect(await problems(cased)).toEqual([
			`${part}/hooks/Hooks.json: must be named exactly hooks.json; case-sensitive filesystems won't find it`,
			missing,
		]);

		const folder = await tree([host]);
		await mkdir(join(folder, part, "hooks", "hooks.json"), { recursive: true });
		expect(await problems(folder)).toEqual([`${part}/hooks/hooks.json: must be a regular file (Agent Plugins §6.2)`]);

		const file = await tree([host]);
		await put(file, part, "not a folder");
		expect(await problems(file)).toEqual([`${part}: must be a directory (Agent Plugins §6.2)`]);
	});
});
