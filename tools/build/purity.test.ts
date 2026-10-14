import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, put, tree } from "./fixtures";
import { purityProblems } from "./purity";

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
