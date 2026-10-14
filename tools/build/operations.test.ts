import { afterEach, describe, expect, test } from "bun:test";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, put, tree } from "./fixtures";
import { MODEL_GEN } from "./model";
import type { OperationsFile } from "./schemas";
import { OPERATIONS_GEN, operationProblems, operationsGen } from "./operations";
import { build, check } from "./output";

afterEach(cleanup);

const FILE = "plugins/demo/core/operations.json";
const MODEL = "plugins/demo/core/model.ftl";

const SEARCH = {
	input: {
		type: "object",
		properties: { query: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1 } },
		required: ["query"],
	},
	output: { type: "object", properties: { results: { type: "array", items: { type: "string" } } } },
	errors: ["signed-out"],
	vault: true,
	tool: { name: "demo_search", readOnly: true, openWorld: true },
};

const SEARCH_TEXT = `search = Searches the web.
    .query = What to search for.
    .limit = How many results.
error-signed-out = The person isn't signed in.
error-crashed = The search broke: { $cause }
error-arguments = Those arguments don't fit: { $problem }
`;

async function problemsFor(operations: unknown, ftl?: string): Promise<string[]> {
	const root = await tree(["omp"]);
	await put(root, FILE, operations);
	if (ftl !== undefined) await put(root, MODEL, ftl);
	return operationProblems(root, [{ name: "demo" }]);
}

describe("operations.json", () => {
	test("an operation with its tool, arguments and errors all described in model.ftl", async () => {
		expect(await problemsFor({ operations: { search: SEARCH } }, SEARCH_TEXT)).toEqual([]);
	});

	test("an operation that is no tool and ends in no error needs no model.ftl", async () => {
		expect(await problemsFor({ operations: { status: { input: { type: "object" }, output: {} } } })).toEqual([]);
	});

	test("the schema refuses a bad id, an input that isn't an object, a field it doesn't know", async () => {
		expect(await problemsFor({ operations: { Search: { ...SEARCH, input: { type: "string" }, extra: 1 } } })).toEqual(
			[
				`${FILE}: /operations/Search must match pattern "^[a-z][a-z0-9]*(-[a-z0-9]+)*$"`,
				`${FILE}: /operations/Search must NOT have additional properties: "extra"`,
				`${FILE}: /operations/Search/input/type must be equal to constant: "object"`,
			],
		);
	});

	test("an input or output Ajv can't compile is refused", async () => {
		const problems = await problemsFor({
			operations: {
				status: { input: { type: "object", properties: { a: { type: "strnig" } } }, output: { foo: 1 } },
			},
		});
		expect(problems).toHaveLength(2);
		expect(problems[0]).toStartWith(`${FILE}: /operations/status/input isn't a JSON Schema Ajv compiles: `);
		expect(problems[1]).toStartWith(
			`${FILE}: /operations/status/output isn't a JSON Schema Ajv compiles: strict mode: unknown keyword: "foo"`,
		);
	});

	test("text inside a schema, at any depth, is refused; a property named description is not", async () => {
		const input = {
			type: "object",
			description: "Arguments.",
			properties: {
				description: { type: "string", title: "Description" },
				tags: { type: "array", items: { type: "string", examples: ["a"] } },
			},
			$defs: { word: { anyOf: [{ type: "string" }, { type: "null", description: "None." }] } },
		};
		expect(await problemsFor({ operations: { status: { input, output: {} } } })).toEqual(
			[
				"/description",
				"/properties/description/title",
				"/properties/tags/items/examples",
				"/$defs/word/anyOf/1/description",
			].map(p => `${FILE}: /operations/status/input${p}: text the model reads goes in core/model.ftl`),
		);
	});

	test("two tools with one name are refused", async () => {
		const text = `${SEARCH_TEXT}find = Finds.\n    .query = What.\n    .limit = How many.\n`;
		expect(await problemsFor({ operations: { search: SEARCH, find: SEARCH } }, text)).toEqual([
			`${FILE}: /operations/find/tool/name "demo_search" is search's too`,
		]);
	});
});

describe("model.ftl for operations", () => {
	test("each tool needs its message, an attribute per argument and none other, each error its message", async () => {
		const text = "search =\n    .query = What to search for.\n    .sort = Unknown.\n";
		expect(await problemsFor({ operations: { search: SEARCH } }, text)).toEqual(
			[
				"error-signed-out is missing: what the error signed-out means",
				"search is missing, or has no value: what the tool demo_search does",
				"search.limit is missing: what the argument limit is for",
				"search.sort names no argument of search",
				"error-crashed is missing: what a tool says when its code fails, with { $cause }",
				"error-arguments is missing: what a tool says when its arguments don't fit its schema, with { $problem }",
			].map(p => `${MODEL}: ${p}`),
		);
	});

	test("tools and errors without a model.ftl are refused", async () => {
		expect(await problemsFor({ operations: { search: SEARCH } })).toEqual([
			`${FILE}: its tools and errors need their text in core/model.ftl`,
		]);
	});
});

describe("operations.gen.ts", () => {
	const STATUS = { input: { type: "object" }, output: {} };

	async function withOperations(): Promise<string> {
		const root = await tree(["omp"]);
		await cp(join(import.meta.dir, "../../kit/core"), join(root, "kit/core"), { recursive: true });
		await put(root, "plugins/demo/src/index.ts", "export {};\n");
		await put(root, MODEL, SEARCH_TEXT);
		await put(root, FILE, {
			$schema: "../../../schemas/operations.schema.json",
			operations: { search: SEARCH, status: STATUS },
		});
		return root;
	}

	test("a plugin's operations with their text: tools described, other operations kept", async () => {
		const root = await withOperations();
		const out = await build(root);
		expect(out).toContain(`wrote: plugins/demo/${OPERATIONS_GEN}`);
		expect(out).toContain(`wrote: plugins/demo/${MODEL_GEN}`);
		const script = `import { operations } from ${JSON.stringify(join(root, "plugins/demo", OPERATIONS_GEN))};
console.log(JSON.stringify({ ids: [...operations.byId.keys()], tools: operations.tools.map(t => [t.tool.name, t.tool.description.text, t.tool.inputSchema]), crashed: operations.crashed("no network").text, badArguments: operations.badArguments("no query").text }));`;
		const run = Bun.spawnSync([process.execPath, "-e", script]);
		expect(run.stderr.toString()).toBe("");
		expect(JSON.parse(run.stdout.toString())).toEqual({
			ids: ["search", "status"],
			tools: [
				[
					"demo_search",
					"Searches the web.",
					{
						...SEARCH.input,
						properties: {
							query: { type: "string", minLength: 1, description: "What to search for." },
							limit: { type: "integer", minimum: 1, description: "How many results." },
						},
					},
				],
			],
			crashed: "The search broke: no network",
			badArguments: "Those arguments don't fit: no query",
		});
	});

	test("without its operations.json, the copy goes", async () => {
		const root = await withOperations();
		await build(root);
		await rm(join(root, FILE));
		expect(await check(root)).toEqual([`unexpected: plugins/demo/${OPERATIONS_GEN}`]);
	});

	test("one text per tool and argument, sorted; none without tools", () => {
		const gen = operationsGen({ operations: { status: STATUS, search: SEARCH } });
		expect(gen.split("\n").filter(l => l.startsWith("text.set"))).toEqual([
			'text.set("search", model.text("search"));',
			'text.set("search.limit", model.text("search.limit"));',
			'text.set("search.query", model.text("search.query"));',
		]);
		const bare = operationsGen({ operations: { status: STATUS } });
		expect(bare).not.toContain("text.set");
		expect(bare).not.toContain("./model.gen");
	});

	test("passes the format check as generated: with tools, without, and long", async () => {
		const root = await tree(["omp"]);
		const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`op${i}`, SEARCH]));
		const sources: OperationsFile[] = [
			{ operations: { search: SEARCH, status: STATUS } },
			{ operations: { status: STATUS } },
			{ operations: many },
		];
		const paths = await Promise.all(
			sources.map(async (src, i) => {
				await put(root, `gen${i}.ts`, operationsGen(src));
				return join(root, `gen${i}.ts`);
			}),
		);
		const plugins = join(import.meta.dir, "../..");
		const oxfmt = Bun.spawnSync(
			[join(plugins, "node_modules/.bin/oxfmt"), "--config", ".oxfmtrc.json", "--check", ...paths],
			{ cwd: plugins },
		);
		expect({ exit: oxfmt.exitCode, out: oxfmt.stdout.toString() }).toMatchObject({ exit: 0 });
	});
});
