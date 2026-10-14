// kit/claude in Claude Code itself: a plugin assembled in a temp folder, its hooks module made of
// io-of.md's two blocks, kit/core and kit/claude copied in as the build copies them, and a tiny core
// of three tools. `claude plugin validate` reads it as a session would, and `claude plugin test`
// runs the mod's own tests (MOD_TEST) in Claude Code's engine, which answers `$` calls with stubs.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "../../tools/build/fixtures";

const KIT = join(import.meta.dir, "..");
const HAS_CLAUDE = Bun.which("claude") !== null;
const NEEDS = "(skipped: needs claude on PATH)";

const MANIFEST = {
	name: "piebird-example",
	version: "0.0.1",
	description: "kit/claude's end-to-end test",
	author: { name: "piebird" },
	hooks: "./com.anthropic.claudecode/hooks/hooks.json",
};

const MODEL_FTL = `greet = Greets someone by name.
    .name = Who to greet.
refuse = Always refuses.
crash = Always breaks.
greeted = { $greeting }, { $name }.
closed = The demo is closed.
context = Greet people with mcp__piebird-example__greet.
error-crashed = It broke: { $cause }
error-arguments = Those arguments don't fit: { $problem }
`;

const MODEL_GEN = `import { Catalog } from "../kit/core/model";

type Messages = {
	greet: undefined;
	"greet.name": undefined;
	refuse: undefined;
	crash: undefined;
	greeted: { greeting: string; name: string };
	closed: undefined;
	context: undefined;
	"error-crashed": { cause: string };
	"error-arguments": { problem: string };
};

export const model = new Catalog<Messages>(${JSON.stringify(MODEL_FTL)});
`;

const NAME = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
const EMPTY = { type: "object", properties: {} };
const OPERATIONS = {
	operations: {
		greet: { input: NAME, output: EMPTY, tool: { name: "greet", readOnly: true, alwaysLoad: true } },
		refuse: { input: EMPTY, output: EMPTY, errors: ["closed"], tool: { name: "refuse" } },
		crash: { input: EMPTY, output: EMPTY, tool: { name: "crash" } },
	},
};

const OPERATIONS_GEN = `import type { ModelText } from "../kit/core/model";
import { parseOperations } from "../kit/core/operations";
import { model } from "./model.gen";

const SOURCE = ${JSON.stringify(JSON.stringify(OPERATIONS))};

const text = new Map<string, ModelText>();
for (const id of ["greet", "greet.name", "refuse", "crash"] as const) text.set(id, model.text(id));

export const operations = parseOperations(SOURCE, text, {
	crashed: cause => model.text("error-crashed", { cause }),
	badArguments: problem => model.text("error-arguments", { problem }),
});
`;

// The greeting from <project>/.greeting, else ~/.greeting, else "Hello"; the name upper-cased by
// the plugin's bin/upper, which reads it on stdin.
const HANDLERS = `import type { Io, Place } from "../kit/core/io";
import type { Handlers } from "../kit/core/operations";
import { model } from "./model.gen";

async function greeting(io: Io, place: Place): Promise<string> {
	const file = (await io.readText(place.project + "/.greeting")) ?? (await io.readText(place.home + "/.greeting"));
	return file?.trim() ?? "Hello";
}

export function handlersFor(io: Io, place: Place): Handlers {
	return {
		async greet(input) {
			const name = typeof input === "object" && input !== null && "name" in input ? String(input.name) : "";
			const run = await io.run([place.plugin + "/bin/upper"], { stdin: name, timeoutMs: 5000 });
			const said = { greeting: await greeting(io, place), name: run.stdout };
			return { ok: true, text: model.text("greeted", said), data: said };
		},
		refuse: () => Promise.resolve({ ok: false, error: "closed", text: model.text("closed") }),
		crash: () => Promise.reject(new Error("the demo broke")),
	};
}
`;

const MOD_TEST = `import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";

const GREET = "mcp__piebird-example__greet";

/** Claude Code beneath the mod: HOME, the project root, the files there are, and bin/upper. */
function host(on: On, files: Record<string, string>): { argv: readonly string[]; stdin?: string; timeoutMs?: number }[] {
	const runs = [];
	on("env.get", ($, e) => ({ value: e.name === "HOME" ? "/home/ada" : undefined }));
	on("session.root", () => ({ value: "/work" }));
	on("fs.read", ($, e) => (e.path in files ? { value: files[e.path] } : { deny: e.path + " failed: ENOENT" }));
	on("fs.exists", ($, e) => ({ value: e.path in files }));
	on("process.run", ($, e) => {
		runs.push({ argv: e.argv, stdin: e.init?.stdin, timeoutMs: e.init?.timeoutMs });
		const stdout = (e.init?.stdin ?? "").toUpperCase();
		return { value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false } };
	});
	return runs;
}

test("registers each tool at session start", async ($, on) => {
	const specs = [];
	on("session.start", () => ({ cwd: "/work" }));
	on("tool.register", ($, e) => {
		specs.push(e);
		return { value: { tool: "mcp__piebird-example__" + e.name } };
	});
	await $.session.start({ surface: null, isInteractive: false, cwd: "/work" });
	const described = { type: "object", properties: { name: { type: "string", description: "Who to greet." } }, required: ["name"] };
	const empty = { type: "object", properties: {} };
	expect(specs).toEqual([
		{ name: "greet", description: "Greets someone by name.", inputSchema: described, isDeferred: false },
		{ name: "refuse", description: "Always refuses.", inputSchema: empty, isDeferred: true },
		{ name: "crash", description: "Always breaks.", inputSchema: empty, isDeferred: true },
	]);
});

test("tells the model about the tools", async ($, on) => {
	on("prompt.context", ($, e) => ({ blocks: e.blocks }));
	const context = await $.prompt.context({ blocks: [{ name: "earlier", text: "kept" }] });
	expect(context.blocks).toEqual([
		{ name: "earlier", text: "kept" },
		{ name: "piebird-example", text: "Greet people with mcp__piebird-example__greet." },
	]);
});

test("a call reaches the handler and its text comes back", async ($, on) => {
	const runs = host(on, {});
	expect(await $.tool.call({ tool: GREET, tool_use_id: "toolu_1", name: "ada" })).toEqual({ result: "Hello, ADA." });
	expect(runs.length).toBe(1);
	expect(runs[0].argv[0]).toMatch(/\\/bin\\/upper$/);
	expect(runs[0]).toMatchObject({ stdin: "ada", timeoutMs: 5000 });
});

test("the handler reads files from the project, then from home", async ($, on) => {
	const files: Record<string, string> = { "/home/ada/.greeting": "Howdy\\n" };
	host(on, files);
	expect(await $.tool.call({ tool: GREET, name: "ada" })).toEqual({ result: "Howdy, ADA." });
	files["/work/.greeting"] = "Hi";
	expect(await $.tool.call({ tool: GREET, name: "bo" })).toEqual({ result: "Hi, BO." });
});

test("a declared error comes back as an error", async ($, on) => {
	host(on, {});
	expect(await $.tool.call({ tool: "mcp__piebird-example__refuse" })).toEqual({ deny: "The demo is closed." });
});

test("a handler that throws comes back as an error in the catalog's words, with its message", async ($, on) => {
	host(on, {});
	expect(await $.tool.call({ tool: "mcp__piebird-example__crash" })).toEqual({ deny: "It broke: the demo broke" });
});

test("a call to another plugin's tool of the same name goes on to Claude Code", async ($, on) => {
	host(on, {});
	on("tool.call", () => ({ result: "Claude Code ran it" }));
	expect(await $.tool.call({ tool: "mcp__other__greet", name: "ada" })).toEqual({ result: "Claude Code ran it" });
});
`;

/** register.ts: io-of.md's example hooks module with its ioOf/placeOf block in place. */
async function registerModule(): Promise<string> {
	const doc = await readFile(join(import.meta.dir, "io-of.md"), "utf8");
	const [snippet, example] = [...doc.matchAll(/```ts\n([\s\S]*?)```/g)].map(m => m[1]);
	const marker = "// ioOf and placeOf, as above.\n";
	if (snippet === undefined || example === undefined || !example.includes(marker)) {
		throw new Error("io-of.md: expected the ioOf/placeOf block, then the hooks module with its marker line");
	}
	return example.replace(marker, snippet);
}

const root = await mkdtemp(join(tmpdir(), "kit-claude-plugin-"));
const state = await mkdtemp(join(tmpdir(), "kit-claude-state-"));
afterAll(() => Promise.all([rm(root, { recursive: true, force: true }), rm(state, { recursive: true, force: true })]));

/** The build copies kit/ without its tests. */
const notTests = (path: string) => !path.endsWith(".test.ts");

beforeAll(async () => {
	await cp(join(KIT, "core"), join(root, "kit/core"), { recursive: true, filter: notTests });
	await cp(join(KIT, "claude"), join(root, "kit/claude"), { recursive: true, filter: notTests });
	await put(root, ".claude-plugin/plugin.json", MANIFEST);
	await put(root, "com.anthropic.claudecode/hooks/hooks.json", { modules: ["./register.ts"] });
	await put(root, "com.anthropic.claudecode/hooks/register.ts", await registerModule());
	await put(root, "com.anthropic.claudecode/tests/mod.test.ts", MOD_TEST);
	await put(root, "core/model.gen.ts", MODEL_GEN);
	await put(root, "core/operations.gen.ts", OPERATIONS_GEN);
	await put(root, "core/handlers.ts", HANDLERS);
});

/** Runs `claude` in the plugin's folder, with HOME and Claude Code's config in a temp folder. */
function claude(...args: string[]): { code: number; output: string } {
	const run = Bun.spawnSync(["claude", ...args], {
		cwd: root,
		env: { PATH: process.env.PATH ?? "", TMPDIR: tmpdir(), HOME: state, CLAUDE_CONFIG_DIR: join(state, "claude") },
		stdin: "ignore",
		timeout: 60_000,
	});
	return { code: run.exitCode, output: `${run.stdout.toString()}${run.stderr.toString()}` };
}

test.skipIf(!HAS_CLAUDE)(`claude plugin validate passes the mod ${NEEDS}`, () => {
	const { code, output } = claude("plugin", "validate", "--strict", ".");
	// A matcher computed from the operations reads as `tool=?`; the engine applies it when it loads.
	expect(output).toContain("./register.ts hooks: session.start, prompt.context, tool.call{tool=?}");
	expect(output).toContain("$.fs.read (via ioOf)");
	expect(output).toContain("$.session.root (via placeOf)");
	expect(code).toBe(0);
});

test.skipIf(!HAS_CLAUDE)(
	`claude plugin test passes the mod's tests ${NEEDS}`,
	() => {
		// The mod's folder is the plugin's: its hooks module imports kit/ and core/ beside it.
		const { code, output } = claude("plugin", "test", ".");
		expect(output).toContain("7 pass");
		expect(output).toContain(" 0 fail");
		expect(code).toBe(0);
	},
	60_000,
);
