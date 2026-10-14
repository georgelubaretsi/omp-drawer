import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanup, put, tree } from "./fixtures";
import { sourceConst } from "./gen-ts";

afterEach(cleanup);

const TEXTS = [
	"short",
	`{"json":"has more double quotes","than":'single'}`,
	`it's 'single' more than "double"`,
	"a backslash \\ before a quote \\\" and \\' too",
	"non-ASCII: “quotes”, é, 🔎, and a\nnewline",
	"long ".repeat(40),
];

test("SOURCE holds the text exactly, as oxfmt writes it", async () => {
	const root = await tree(["omp"]);
	const files = await Promise.all(
		TEXTS.map(async (text, i) => {
			await put(root, `s${i}.ts`, `${sourceConst(text)}\n\nexport { SOURCE };\n`);
			return join(root, `s${i}.ts`);
		}),
	);
	const plugins = join(import.meta.dir, "../..");
	const oxfmt = Bun.spawnSync(
		[join(plugins, "node_modules/.bin/oxfmt"), "--config", ".oxfmtrc.json", "--check", ...files],
		{
			cwd: plugins,
		},
	);
	expect({ exit: oxfmt.exitCode, out: oxfmt.stdout.toString() }).toMatchObject({ exit: 0 });
	const script = files.map((f, i) => `import { SOURCE as s${i} } from ${JSON.stringify(f)};`).join("\n");
	const run = Bun.spawnSync([
		process.execPath,
		"-e",
		`${script}\nconsole.log(JSON.stringify([${TEXTS.map((_, i) => `s${i}`).join(",")}]));`,
	]);
	expect(JSON.parse(run.stdout.toString())).toEqual(TEXTS);
});
