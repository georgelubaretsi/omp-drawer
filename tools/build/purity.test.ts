import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, put, tree } from "./fixtures";
import { brandProblems, ompImportProblems, purityProblems } from "./purity";

afterEach(cleanup);

const PLUGINS = [{ name: "demo" }, { name: "other" }];

async function withFiles(files: Record<string, string>): Promise<string> {
	const root = await tree(["omp"]);
	for (const [rel, content] of Object.entries(files)) await put(root, rel, content);
	return root;
}

describe("core purity", () => {
	test("core imports its own files, at any depth, and the kit's core", async () => {
		const root = await withFiles({
			"plugins/demo/core/policy.ts": 'import { model } from "./model.gen";\nimport { a } from "./journals/omp";\n',
			"plugins/demo/core/journals/omp.ts":
				'import { b } from "../omp";\nexport { x } from "../../kit/core/model";\n',
			"plugins/demo/core/model.gen.ts": 'import { Catalog } from "../kit/core/model";\n',
			"kit/core/model.ts": 'import { FluentBundle } from "./vendor/fluent/index.js";\n',
		});
		expect(await purityProblems(root, PLUGINS)).toEqual([]);
	});

	test("an import reaching a shell, another plugin or a shell kit is refused, static or dynamic", async () => {
		const root = await withFiles({
			"plugins/demo/core/a.ts": [
				'import { t } from "../src/tools";',
				'export * from "../program/main";',
				'const m = await import("../com.anthropic.claudecode/hooks/register");',
				'import { o } from "../../other/core/policy";',
				'import { k } from "../kit/omp/template";',
				'import { s } from "./sub/../../src/x";',
			].join("\n"),
			"kit/core/b.ts": 'import { r } from "../omp/template";\n',
		});
		const demo = "outside plugins/demo/core and plugins/demo/kit/core; core code stays pure";
		expect(await purityProblems(root, PLUGINS)).toEqual([
			"kit/core/b.ts: imports ../omp/template, outside kit/core; core code stays pure",
			`plugins/demo/core/a.ts: imports ../src/tools, ${demo}`,
			`plugins/demo/core/a.ts: imports ../program/main, ${demo}`,
			`plugins/demo/core/a.ts: imports ../com.anthropic.claudecode/hooks/register, ${demo}`,
			`plugins/demo/core/a.ts: imports ../../other/core/policy, ${demo}`,
			`plugins/demo/core/a.ts: imports ../kit/omp/template, ${demo}`,
			`plugins/demo/core/a.ts: imports ./sub/../../src/x, ${demo}`,
		]);
	});

	test("tests and declaration files may reach outside", async () => {
		const root = await withFiles({
			"plugins/demo/core/policy.test.ts": 'import { fixture } from "../src/fixture";\n',
			"plugins/demo/core/types.d.ts": 'import type { T } from "../src/types";\n',
		});
		expect(await purityProblems(root, PLUGINS)).toEqual([]);
	});
});

describe("an omp extension's imports", () => {
	test("its own files and carried copies, omp's packages, Bun's and Node's built-ins, and types from anywhere", async () => {
		const root = await withFiles({
			"plugins/demo/src/index.ts": [
				'import { join } from "node:path";',
				'import { $ } from "bun";',
				'import { Database } from "bun:sqlite";',
				'import { logger } from "@oh-my-pi/pi-utils";',
				'import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";',
				'import type { Document } from "yaml";',
				'import { parseDocument } from "../vendor/yaml/index.js";',
				'import { tool } from "../kit/omp/tools";',
			].join("\n"),
			"kit/omp/tools.ts": 'import { model } from "../core/model";\n',
		});
		expect(await ompImportProblems(root, PLUGINS)).toEqual([]);
	});

	test("a package omp won't install is refused, in the extension or the kit parts it carries", async () => {
		const root = await withFiles({
			"plugins/demo/src/a.ts": 'import { parseDocument } from "yaml";\nconst z = await import("zod");\n',
			"kit/bun/b.ts": 'export { x } from "left-pad";\n',
			"plugins/demo/program/main.ts": 'import { Server } from "@modelcontextprotocol/server";\n',
		});
		const carry = "which omp doesn't install with the plugin; carry it (the plugin's vendor.json) or use Bun's own";
		expect(await ompImportProblems(root, PLUGINS)).toEqual([
			`kit/bun/b.ts: imports left-pad, ${carry}`,
			`plugins/demo/src/a.ts: imports yaml, ${carry}`,
			`plugins/demo/src/a.ts: imports zod, ${carry}`,
		]);
	});

	test("every kind of script is scanned: JSX, module and CommonJS TypeScript and JavaScript", async () => {
		const root = await withFiles({
			"plugins/demo/src/view.tsx": 'import { h } from "preact";\nexport const v = <div />;\n',
			"plugins/demo/src/b.jsx": 'import { h } from "preact";\n',
			"plugins/demo/src/c.mts": 'import yaml from "yaml";\n',
			"plugins/demo/src/d.cts": 'import zod = require("zod");\n',
			"kit/omp/e.cjs": 'const pad = require("left-pad");\n',
			"kit/omp/f.test.tsx": 'import { render } from "preact";\n',
		});
		// JSX also imports its runtime, another package omp won't install: one file, several findings.
		const files = new Set((await ompImportProblems(root, PLUGINS)).map(p => p.slice(0, p.indexOf(":"))));
		expect([...files].toSorted()).toEqual([
			"kit/omp/e.cjs",
			"plugins/demo/src/b.jsx",
			"plugins/demo/src/c.mts",
			"plugins/demo/src/d.cts",
			"plugins/demo/src/view.tsx",
		]);
	});
});

describe("ModelText's brand", () => {
	test("only the kit's model.ts and each plugin's copy write it; tests and shells don't", async () => {
		const brand = 'readonly brand = "piebird-catalog";\n';
		const root = await withFiles({
			"kit/core/model.ts": brand,
			"plugins/demo/kit/core/model.ts": brand,
			"plugins/demo/node_modules/x/index.js": brand,
			"plugins/demo/vendor/y/index.js": brand,
			"plugins/demo/src/forge.ts": `const t = { text: "hi", brand: "piebird-catalog" };\n`,
			"plugins/demo/test/forge.test.ts": `const t = { text: "hi", brand: 'piebird-catalog' };\n`,
			"kit/claude/tools.ts": `export const t = { text: "hi", brand: "piebird-catalog" };\n`,
		});
		const files = (await brandProblems(root, PLUGINS)).map(p => p.slice(0, p.indexOf(":")));
		expect(files.toSorted()).toEqual([
			"kit/claude/tools.ts",
			"plugins/demo/src/forge.ts",
			"plugins/demo/test/forge.test.ts",
		]);
	});
});
