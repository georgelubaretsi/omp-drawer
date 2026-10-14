import { afterEach, describe, expect, test } from "bun:test";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, put, tree } from "./fixtures";
import { ValidationError } from "./json";
import { MODEL, MODEL_GEN, messageVariables, modelGen, parseCatalog } from "./model";
import { build, check } from "./output";

afterEach(cleanup);

function variables(source: string): Record<string, string[]> {
	return Object.fromEntries(messageVariables(parseCatalog(source, MODEL), MODEL));
}

function rejected(source: string): string[] {
	try {
		variables(source);
	} catch (e) {
		if (e instanceof ValidationError) return e.problems;
		throw e;
	}
	return [];
}

describe("the variables each message needs", () => {
	test("a select's selector and every variant's variables", () => {
		expect(variables("n = { $count ->\n    [one] one { $what }\n   *[other] { $count } { $where }\n}\n")).toEqual({
			n: ["count", "what", "where"],
		});
	});

	test("a referenced message's, its attributes' too, as Fluent passes them on", () => {
		const source = "a = { b } and { c.title }\nb = { $x }\nc =\n    .title = { $y }\n";
		expect(variables(source)).toEqual({ a: ["x", "y"], b: ["x"], "c.title": ["y"] });
	});

	test("a function's arguments, but not a term's own variables, and no term of its own", () => {
		expect(variables('-t = { $inner }\nm = { -t(inner: "x") } { NUMBER($n) }\n')).toEqual({ m: ["n"] });
	});

	test("a message with only attributes offers only them", () => {
		expect(variables("m =\n    .a = A\n    .b = { $v }\n")).toEqual({ "m.a": [], "m.b": ["v"] });
	});
});

describe("a catalog the build refuses", () => {
	test("anything the runtime parser would skip without a word", () => {
		expect(rejected("good = Fine\nbad = { $\n")).toEqual([`${MODEL}: bad doesn't parse as Fluent`]);
		// A second definition that doesn't parse, while the first does.
		expect(rejected("m = One\nm = { $\n")).toEqual([`${MODEL}: m doesn't parse as Fluent`]);
		// An id Fluent doesn't take, and a continuation line that isn't indented.
		expect(rejected("kagi.search = Search\n")).toEqual([`${MODEL}: "kagi.search = Search" starts no entry`]);
		expect(rejected("m = first line\nsecond line\n")).toEqual([`${MODEL}: "second line" starts no entry`]);
	});

	test("takes what Fluent takes unindented: a variant, an attribute, a closing brace", () => {
		expect(rejected("n = { $c ->\n[one] x\n*[other] y\n}\nm =\n.title = T\n# a comment\n")).toEqual([]);
	});

	test("an id defined twice", () => {
		expect(rejected("m = One\nm = Two\n")).toEqual([`${MODEL}: m is there twice`]);
	});

	test("a reference to a message that isn't there, or back to itself", () => {
		expect(rejected("m = { gone }\n")).toEqual([`${MODEL}: a reference to gone, which isn't there`]);
		expect(rejected("a = { b }\nb = { a }\n")).toEqual([`${MODEL}: a refers to itself`]);
	});
});

describe("model.gen.ts", () => {
	const FTL = "results = { $count ->\n    [one] One result for “{ $query }” 🔎\n   *[other] { $count } results\n}\n";

	async function withCatalog(): Promise<string> {
		const root = await tree(["omp"]);
		await cp(join(import.meta.dir, "../../kit/core"), join(root, "kit/core"), { recursive: true });
		await put(root, "plugins/demo/src/index.ts", "export {};\n");
		await put(root, `plugins/demo/${MODEL}`, FTL);
		return root;
	}

	test("a plugin's copy formats its catalog, text as written", async () => {
		const root = await withCatalog();
		expect(await build(root)).toContain(`wrote: plugins/demo/${MODEL_GEN}`);
		const script = `import { model } from ${JSON.stringify(join(root, "plugins/demo", MODEL_GEN))};
for (const count of [1, 4]) console.log(model.text("results", { count, query: "bun" }).text);`;
		const run = Bun.spawnSync([process.execPath, "-e", script]);
		expect(run.stdout.toString()).toBe("One result for “bun” 🔎\n4 results\n");
	});

	test("passes the format check as generated: short or long, ids that need quotes, text with quotes", async () => {
		const root = await tree(["omp"]);
		const many = Array.from({ length: 30 }, (_, i) => `m${i} = Message { $n${i} }\n`).join("");
		const quoted = `q = Say "yes", "no" or 'maybe'; a backslash \\" stays.\n`;
		const catalogs = ["a = A\n", `${FTL}tool-name = x\n    .short-form = { $set-to }\n${many}`, quoted];
		const paths = await Promise.all(
			catalogs.map(async (ftl, i) => {
				await put(root, `gen${i}.ts`, modelGen(ftl, MODEL));
				return join(root, `gen${i}.ts`);
			}),
		);
		const plugins = join(import.meta.dir, "../..");
		const oxfmt = Bun.spawnSync(
			[join(plugins, "node_modules/.bin/oxfmt"), "--config", ".oxfmtrc.json", "--check", ...paths],
			{
				cwd: plugins,
			},
		);
		expect({ exit: oxfmt.exitCode, out: oxfmt.stdout.toString() }).toMatchObject({ exit: 0 });
	});

	test("an edited catalog makes the copy out of date; without one, the copy goes", async () => {
		const root = await withCatalog();
		await build(root);
		await put(root, `plugins/demo/${MODEL}`, "results = None\n");
		expect(await check(root)).toEqual([`differs: plugins/demo/${MODEL_GEN}`]);
		await rm(join(root, `plugins/demo/${MODEL}`));
		expect(await check(root)).toEqual([`unexpected: plugins/demo/${MODEL_GEN}`]);
	});
});
