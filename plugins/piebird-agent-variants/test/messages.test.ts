// What the extension says: its tool's results and errors, and the notice of temporary agents.
import type { Surroundings } from "../src/index";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { variantsInOmp } from "../src/index";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const models = [
	{ provider: "opencode", id: "ox-alpha-free", name: "Ox Alpha", cost: zero },
	{
		provider: "openrouter",
		id: "ox-alpha",
		name: "Ox Alpha",
		cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
	},
].map(model => ({ ...model, efforts: [] }));

type Execute = (...args: unknown[]) => Promise<{ content: { text: string }[]; isError?: boolean }>;
type Handler = (event: unknown, ctx: unknown) => Promise<void>;

/** What the fake omp and git answer: `git status` output, and which command fails. */
interface Shell {
	status?: string;
	fails?: "config" | "unpack" | "status";
	/** Runs as each command starts. */
	onRun?: () => void;
}

/** A project with a designer agent; in a git checkout (a `.git` folder) unless `git` is false. */
async function project(git = true): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "piebird-agent-variants-messages-"));
	roots.push(root);
	await mkdir(join(root, ".omp", "agents"), { recursive: true });
	if (git) await mkdir(join(root, ".git"));
	const designer = "---\nname: designer\ndescription: UI specialist\n---\n\nDesign.\n";
	await writeFile(join(root, ".omp", "agents", "designer.md"), designer);
	return root;
}

function gitStatus(shell: Shell) {
	if (shell.fails === "status") return { code: 128, stdout: "", stderr: "fatal: index file corrupt\n" };
	return { code: 0, stdout: shell.status ?? "", stderr: "" };
}

function command(root: string, shell: Shell, name: string, args: string[]) {
	const failed = { code: 1, stdout: "", stderr: "boom" };
	if (name === "git") return gitStatus(shell);
	if (args[0] === "config")
		return shell.fails === "config" ? failed : { code: 0, stdout: join(root, "user"), stderr: "" };
	return shell.fails === "unpack" ? failed : { code: 0, stdout: "", stderr: "" };
}

/** `oauth`: the providers signed in with OAuth, a subscription login. */
function load(root: string, shell: Shell = {}, oauth: string[] = []) {
	let execute: Execute | undefined;
	let sessionStart: Handler | undefined;
	const notices: string[] = [];
	const pi = {
		setLabel: () => undefined,
		on: (event: string, handler: Handler) => {
			if (event === "session_start") sessionStart = handler;
		},
		registerTool: (tool: { execute: Execute }) => {
			execute = tool.execute;
		},
	};
	const signals: (AbortSignal | undefined)[] = [];
	const at: Surroundings = {
		models: () => models.map(m => ({ ...m, oauth: oauth.includes(m.provider) })),
		execute: async (name, args, options) => {
			signals.push(options?.signal);
			shell.onRun?.();
			return command(root, shell, name, args);
		},
		now: () => "2026-10-12T09:00:00.000Z",
	};
	// The extension's parameter is omp's ExtensionAPI; the stand-in has the part of it the extension uses.
	Reflect.apply(variantsInOmp, undefined, [pi, at]);
	const ctx = {
		cwd: root,
		ui: { notify: (text: string) => notices.push(text) },
		setTimeout: (run: () => void) => run(),
	};
	const call = async (params: Record<string, unknown>, signal?: AbortSignal) => {
		if (execute === undefined) throw new Error("no tool registered");
		const result = await execute("call", params, signal, undefined, ctx);
		return { text: result.content[0]?.text, error: result.isError === true };
	};
	return {
		signals,
		call,
		run: async (params: Record<string, unknown>) => {
			const { text, error } = await call(params);
			if (error) throw new Error(`the call failed: ${text}`);
			return text;
		},
		failure: async (params: Record<string, unknown>) => {
			const { text, error } = await call(params);
			if (!error) throw new Error(`expected the call to fail: ${text}`);
			return text;
		},
		notices: async () => {
			await sessionStart?.({}, ctx);
			return notices;
		},
	};
}

const write = { projectWriteApproved: true };

describe("the tool's results", () => {
	test("is blocked without project write approval, and asks before paid routes", async () => {
		const { run } = load(await project());
		// Blocked, it names the call to make once writing is allowed.
		expect(await run({ modelQuery: "ox alpha" })).toContain("projectWriteApproved: true");
		expect(await run({ modelQuery: "ox alpha", includePaidFallbacks: true, ...write })).toBe(
			"Free/subscription routes available: opencode/ox-alpha-free. Explicit approval is required before configuring paid per-token routes:\nopenrouter/ox-alpha: input 1, output 2, cache read 0.1, cache write 0.2",
		);
	});

	test("takes a route signed in with OAuth as a subscription, without asking", async () => {
		const { run } = load(await project(), {}, ["openrouter"]);
		expect(
			await run({ sourceAgent: "designer", modelQuery: "ox alpha", includePaidFallbacks: true, ...write }),
		).toStartWith(
			"Configured temporary designer variant tmp-designer-ox-alpha using opencode/ox-alpha-free → openrouter/ox-alpha. Use agent “tmp-designer-ox-alpha”",
		);
	});

	test("configures a variant, says which agent to use, and lists it at the next session start", async () => {
		const root = await project();
		const { run, failure, notices } = load(root);
		expect(await run({ sourceAgent: "designer", modelQuery: "ox alpha free", ...write })).toStartWith(
			"Configured temporary designer variant tmp-designer-ox-alpha-free using opencode/ox-alpha-free. Use agent “tmp-designer-ox-alpha-free”",
		);
		const agent = await readFile(join(root, ".omp", "agents", "tmp-designer-ox-alpha-free.md"), "utf8");
		expect(agent).toContain("description: Temporary designer variant for ox alpha free");
		expect(await notices()).toEqual([
			"Temporary OMP agents in this project:\ntmp-designer-ox-alpha-free — from designer — ox alpha free",
		]);

		const again = { sourceAgent: "designer", modelQuery: "ox alpha free", ...write };
		expect(await failure(again)).toBe(
			"tmp-designer-ox-alpha-free already exists. Set replaceTemporary only after the user requests an update.",
		);
		const other = {
			...again,
			sourceAgent: "reviewer",
			targetName: "tmp-designer-ox-alpha-free",
			replaceTemporary: true,
		};
		expect(await failure(other)).toBe("tmp-designer-ox-alpha-free belongs to a different temporary source or role.");
	});
});

describe("a cancelled call", () => {
	test("runs its commands under the call's signal and writes no variant", async () => {
		const root = await project();
		const cancel = new AbortController();
		const { call, signals } = load(root, { onRun: () => cancel.abort() });
		await call({ sourceAgent: "designer", modelQuery: "ox alpha free", ...write }, cancel.signal).catch(
			() => undefined,
		);
		expect(signals.length).toBeGreaterThan(0);
		expect(signals.every(signal => signal === cancel.signal)).toBe(true);
		expect(existsSync(join(root, ".omp", "agents", "tmp-designer-ox-alpha-free.md"))).toBe(false);
	});
});

describe("the tool's errors", () => {
	test("refuse a bad name, an unknown model, a file that isn't a variant, and uncommitted configuration", async () => {
		const root = await project();
		const { failure } = load(root);
		expect(await failure({ modelQuery: "ox", targetName: "bad name", ...write })).toBe(
			"Temporary agent names may contain only letters, numbers, underscores, and hyphens.",
		);
		expect(await failure({ modelQuery: "nothing", thinking: "high", ...write })).toBe(
			"No authenticated model matches “nothing” with high thinking.",
		);
		const plain = join(root, ".omp", "agents", "plain.md");
		await writeFile(plain, "---\nname: plain\ndescription: Not a variant\n---\n");
		expect(await failure({ modelQuery: "ox alpha free", targetName: "plain", ...write })).toBe(
			`${plain} already exists and is not a temporary agent variant.`,
		);
		const dirty = load(root, { status: " M .omp/config.yml" });
		expect(await dirty.failure({ modelQuery: "ox alpha free", ...write })).toContain("uncommitted changes");
		expect(await load(root, { fails: "status" }).failure({ modelQuery: "ox alpha free", ...write })).toBe(
			"Couldn't check the target OMP configuration for uncommitted changes (git status: fatal: index file corrupt); refusing to write.",
		);
	});

	test("with no .git above the project, nothing is checked and the variant is written", async () => {
		const { run } = load(await project(false), { fails: "status" });
		expect(await run({ sourceAgent: "designer", modelQuery: "ox alpha free", ...write })).toStartWith(
			"Configured temporary designer variant tmp-designer-ox-alpha-free",
		);
	});

	test("say when the source agent can't be found, or omp can't say where it is", async () => {
		const root = await project();
		const nobody = { sourceAgent: "nobody", modelQuery: "ox alpha free", ...write };
		expect(await load(root).failure(nobody)).toBe(
			"Agent “nobody” was not found in project, user, or bundled agent definitions.",
		);
		expect(await load(root, { fails: "config" }).failure(nobody)).toBe(
			"Unable to resolve the active OMP config path: boom",
		);
		expect(await load(root, { fails: "unpack" }).failure(nobody)).toBe("Unable to export bundled agents: boom");
	});
});
