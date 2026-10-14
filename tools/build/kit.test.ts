import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, put, tree } from "./fixtures";
import { modSnippetProblems } from "./kit";
import { build, check } from "./output";

afterEach(cleanup);

const KIT = "plugins/demo/kit";

/** Every kit part, each with a nested file and a test. */
async function kitTree(hosts = ["omp"]): Promise<string> {
	const root = await tree(hosts);
	for (const part of ["core", "omp", "claude", "program"]) {
		await put(root, `kit/${part}/a.ts`, `// ${part}\n`);
		await put(root, `kit/${part}/deep/b.ts`, `// ${part} deep\n`);
		await put(root, `kit/${part}/a.test.ts`, "// a test\n");
	}
	return root;
}

/** The demo plugin's kit files after a build, each with whether it equals its source. */
async function copies(root: string): Promise<Record<string, boolean>> {
	await build(root);
	if (!existsSync(join(root, KIT))) return {};
	const found: Record<string, boolean> = {};
	for (const f of await readdir(join(root, KIT), { recursive: true, withFileTypes: true })) {
		if (!f.isFile()) continue;
		const rel = join(f.parentPath, f.name).slice(join(root, KIT).length + 1);
		found[rel] = (await readFile(join(root, KIT, rel), "utf8")) === (await readFile(join(root, "kit", rel), "utf8"));
	}
	return found;
}

describe("kit", () => {
	test("a plugin with no code carries none", async () => {
		expect(await copies(await kitTree())).toEqual({});
	});

	test("an omp extension carries core and omp, without the tests", async () => {
		const root = await kitTree();
		await put(root, "plugins/demo/src/index.ts", "export {};\n");
		expect(await copies(root)).toEqual({
			"core/a.ts": true,
			"core/deep/b.ts": true,
			"omp/a.ts": true,
			"omp/deep/b.ts": true,
		});
	});

	test("each shell brings its own part: a Claude Code mod claude, a program program", async () => {
		const root = await kitTree(["omp", "claude"]);
		await put(root, "plugins/demo/com.anthropic.claudecode/hooks/hooks.json", { modules: ["./register.ts"] });
		await put(root, "plugins/demo/com.anthropic.claudecode/hooks/register.ts", "export {};\n");
		await put(root, "plugins/demo/program/main.ts", "export {};\n");
		expect(Object.keys(await copies(root)).toSorted()).toEqual([
			"claude/a.ts",
			"claude/deep/b.ts",
			"core/a.ts",
			"core/deep/b.ts",
			"program/a.ts",
			"program/deep/b.ts",
		]);
	});

	test("an edited copy is out of date, and the build puts its source back", async () => {
		const root = await kitTree();
		await put(root, "plugins/demo/src/index.ts", "export {};\n");
		await build(root);
		await put(root, `${KIT}/omp/a.ts`, "edited\n");
		expect(await check(root)).toEqual([`differs: ${KIT}/omp/a.ts`]);
		expect((await copies(root))["omp/a.ts"]).toBe(true);
	});

	test("a part the plugin no longer needs, and a file kit/ no longer has, are deleted", async () => {
		const root = await kitTree();
		await put(root, "plugins/demo/src/index.ts", "export {};\n");
		await put(root, "plugins/demo/program/main.ts", "export {};\n");
		await build(root);
		await rm(join(root, "plugins/demo/program"), { recursive: true });
		await rm(join(root, "kit/omp/deep"), { recursive: true });
		expect(await check(root)).toEqual([
			`unexpected: ${KIT}/omp/deep/b.ts`,
			`unexpected: ${KIT}/program/a.ts`,
			`unexpected: ${KIT}/program/deep/b.ts`,
		]);
		expect(Object.keys(await copies(root)).toSorted()).toEqual(["core/a.ts", "core/deep/b.ts", "omp/a.ts"]);
	});
});

describe("a mod's ioOf", () => {
	const BLOCK = "function ioOf($: Api): Io {\n\treturn { readText: path => $.fs.read(path) };\n}\n";
	const MODULE = "plugins/demo/com.anthropic.claudecode/hooks/register.ts";

	async function snippetProblems(register: string): Promise<string[]> {
		const root = await tree(["claude"]);
		await put(
			root,
			"kit/claude/io-of.md",
			`# ioOf\n\n\`\`\`ts\n${BLOCK}\`\`\`\n\nThe hooks module:\n\n\`\`\`ts\nexport {};\n\`\`\`\n`,
		);
		await put(root, MODULE, register);
		return modSnippetProblems(root, [{ name: "demo" }]);
	}

	test("is io-of.md's first block as it is, or the mod makes none", async () => {
		expect(await snippetProblems(`import x from "y";\n\n${BLOCK}\nexport const register = on => {};\n`)).toEqual([]);
		expect(await snippetProblems("export const register = on => {};\n")).toEqual([]);
	});

	test("a copy that drifted is refused", async () => {
		const drifted = BLOCK.replace("$.fs.read(path)", "$.fs.read(path, { as: 'text' })");
		expect(await snippetProblems(drifted)).toEqual([
			`${MODULE}: its ioOf and placeOf differ from kit/claude/io-of.md's; copy the block as it is`,
		]);
	});
});
