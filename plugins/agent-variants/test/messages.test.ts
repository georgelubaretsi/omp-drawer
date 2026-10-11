// What the extension says: its tool's results and errors, and the notice of temporary agents.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import agentVariants from "../src/index";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

/** A stand-in for omp's zod: every call chains, so building the parameters only reads their descriptions. */
const chain: object = new Proxy(() => chain, { get: () => chain });

const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const models = [
	{ provider: "opencode", id: "ox-alpha-free", name: "Ox Alpha", cost: zero },
	{
		provider: "openrouter",
		id: "ox-alpha",
		name: "Ox Alpha",
		cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
	},
].map(model => ({ ...model, thinking: { efforts: [] } }));

type Execute = (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
type Handler = (event: unknown, ctx: unknown) => Promise<void>;

/** What the fake omp and git answer: `git status` output, and which omp command fails. */
interface Shell {
	status?: string;
	fails?: "config" | "unpack";
}

async function project(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "omp-agent-variants-messages-"));
	roots.push(root);
	await mkdir(join(root, ".omp", "agents"), { recursive: true });
	const designer = "---\nname: designer\ndescription: UI specialist\n---\n\nDesign.\n";
	await writeFile(join(root, ".omp", "agents", "designer.md"), designer);
	return root;
}

function command(root: string, shell: Shell, name: string, args: string[]) {
	const failed = { code: 1, stdout: "", stderr: "boom" };
	if (name === "git") return { code: 0, stdout: shell.status ?? "", stderr: "" };
	if (args[0] === "config")
		return shell.fails === "config" ? failed : { code: 0, stdout: join(root, "user"), stderr: "" };
	return shell.fails === "unpack" ? failed : { code: 0, stdout: "", stderr: "" };
}

function load(root: string, shell: Shell = {}) {
	let execute: Execute | undefined;
	let sessionStart: Handler | undefined;
	const notices: string[] = [];
	const pi = {
		zod: chain,
		setLabel: () => {},
		on: (event: string, handler: Handler) => {
			if (event === "session_start") sessionStart = handler;
		},
		registerTool: (tool: { execute: Execute }) => {
			execute = tool.execute;
		},
		exec: (name: string, args: string[]) => Promise.resolve(command(root, shell, name, args)),
	};
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in for the parts of omp's API the extension uses
	agentVariants(pi as unknown as ExtensionAPI);
	const ctx = {
		cwd: root,
		models: { list: () => models },
		ui: { notify: (text: string) => notices.push(text) },
		setTimeout: (run: () => void) => run(),
	};
	return {
		run: async (params: Record<string, unknown>) => {
			if (execute === undefined) throw new Error("no tool registered");
			return (await execute("call", params, undefined, undefined, ctx)).content[0]?.text;
		},
		notices: async () => {
			await sessionStart?.({}, ctx);
			return notices;
		},
	};
}

async function failure(run: Promise<unknown>): Promise<string> {
	try {
		await run;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	throw new Error("expected the call to fail");
}

const write = { projectWriteApproved: true };

describe("the tool's results", () => {
	test("is blocked without project write approval, and asks before paid routes", async () => {
		const { run } = load(await project());
		expect(await run({ modelQuery: "ox alpha" })).toBe(
			"Project write not approved. Check repository instructions and status before creating .omp agent configuration.",
		);
		expect(await run({ modelQuery: "ox alpha", includePaidFallbacks: true, ...write })).toBe(
			"Free/subscription routes available: opencode/ox-alpha-free. Explicit approval is required before configuring paid per-token routes:\nopenrouter/ox-alpha: input 1, output 2, cache read 0.1, cache write 0.2",
		);
	});

	test("configures a variant, says which agent to use, and lists it at the next session start", async () => {
		const root = await project();
		const { run, notices } = load(root);
		expect(await run({ sourceAgent: "designer", modelQuery: "ox alpha free", ...write })).toBe(
			"Configured temporary designer variant tmp-designer-ox-alpha-free using opencode/ox-alpha-free. Use agent “tmp-designer-ox-alpha-free” for the user's original request.",
		);
		const agent = await readFile(join(root, ".omp", "agents", "tmp-designer-ox-alpha-free.md"), "utf8");
		expect(agent).toContain("description: Temporary designer variant for ox alpha free");
		expect(await notices()).toEqual([
			"Temporary OMP agents in this project:\ntmp-designer-ox-alpha-free — from designer — ox alpha free",
		]);

		const again = { sourceAgent: "designer", modelQuery: "ox alpha free", ...write };
		expect(await failure(run(again))).toBe(
			"tmp-designer-ox-alpha-free already exists. Set replaceTemporary only after the user requests an update.",
		);
		const other = {
			...again,
			sourceAgent: "reviewer",
			targetName: "tmp-designer-ox-alpha-free",
			replaceTemporary: true,
		};
		expect(await failure(run(other))).toBe(
			"tmp-designer-ox-alpha-free belongs to a different temporary source or role.",
		);
	});
});

describe("the tool's errors", () => {
	test("refuse a bad name, an unknown model, a file that isn't a variant, and uncommitted configuration", async () => {
		const root = await project();
		const { run } = load(root);
		expect(await failure(run({ modelQuery: "ox", targetName: "bad name", ...write }))).toBe(
			"Temporary agent names may contain only letters, numbers, underscores, and hyphens.",
		);
		expect(await failure(run({ modelQuery: "nothing", thinking: "high", ...write }))).toBe(
			"No authenticated model matches “nothing” with high thinking.",
		);
		const plain = join(root, ".omp", "agents", "plain.md");
		await writeFile(plain, "---\nname: plain\ndescription: Not a variant\n---\n");
		expect(await failure(run({ modelQuery: "ox alpha free", targetName: "plain", ...write }))).toBe(
			`${plain} already exists and is not a temporary agent variant.`,
		);
		const dirty = load(root, { status: " M .omp/config.yml" });
		expect(await failure(dirty.run({ modelQuery: "ox alpha free", ...write }))).toBe(
			"Target OMP configuration has uncommitted changes; refusing to overwrite user work.",
		);
	});

	test("say when the source agent can't be found, or omp can't say where it is", async () => {
		const root = await project();
		const nobody = { sourceAgent: "nobody", modelQuery: "ox alpha free", ...write };
		expect(await failure(load(root).run(nobody))).toBe(
			"Agent “nobody” was not found in project, user, or bundled agent definitions.",
		);
		expect(await failure(load(root, { fails: "config" }).run(nobody))).toBe(
			"Unable to resolve the active OMP config path: boom",
		);
		expect(await failure(load(root, { fails: "unpack" }).run(nobody))).toBe("Unable to export bundled agents: boom");
	});
});
