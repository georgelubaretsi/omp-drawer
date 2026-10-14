// Claude Code's side of a scripted session: the plugin's mod registered with a stand-in for Claude
// Code's engine, whose `$` works on the real files of the scenario's home; the tools it registers,
// the context blocks it adds, and what its tool.call hook answers.
import type { Api, HookStream, ProcessSpawnChunk, ProcessSpawnResult, Register, ToolSpec } from "claude-code";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describedTool } from "./tools";
import type { Scenario, Seen, Setup, Step } from "./types";

type Next = (e: unknown) => Promise<unknown>;

/** The stand-in engine: `$`, the hooks the mod registered by event, and the tools it registered. */
interface Engine {
	readonly $: Api;
	readonly chain: Map<string, Function[]>;
	readonly registered: ToolSpec[];
}

function spawned(argv: readonly string[]): HookStream<ProcessSpawnChunk, ProcessSpawnResult> {
	const proc = Bun.spawn([...argv], { stdout: "pipe", stderr: "ignore" });
	const ended = Promise.withResolvers<ProcessSpawnResult>();
	async function* chunks(): AsyncGenerator<ProcessSpawnChunk, ProcessSpawnResult> {
		const decoder = new TextDecoder();
		try {
			for await (const bytes of proc.stdout) {
				const text = decoder.decode(bytes, { stream: true });
				if (text !== "") yield { stream: "stdout", text };
			}
			const result = { code: await proc.exited, signal: null };
			ended.resolve(result);
			return result;
		} finally {
			proc.kill();
		}
	}
	return Object.assign(chunks(), { result: ended.promise });
}

async function run(argv: readonly string[], init: { stdin?: string } = {}) {
	const proc = Bun.spawn([...argv], {
		stdin: init.stdin === undefined ? "ignore" : new TextEncoder().encode(init.stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false };
}

function kindOf(entry: { isFile(): boolean; isDirectory(): boolean }): "file" | "dir" | "other" {
	return entry.isFile() ? "file" : entry.isDirectory() ? "dir" : "other";
}

/** `$` for the scenario's session: its home, project and id, the plugin's folder, real files. */
function apiOf(home: string, setup: Setup, plugin: string, registered: ToolSpec[]): Api {
	return {
		fs: {
			read: path => readFile(path, "utf8"),
			exists: async path => existsSync(path),
			stat: async path => {
				const s = await stat(path);
				return { kind: kindOf(s), size: s.size };
			},
			list: async path => {
				const dir = path ?? setup.project;
				const entries = await readdir(dir, { withFileTypes: true });
				return Promise.all(
					entries.map(async e => ({
						name: e.name,
						kind: kindOf(e),
						size: 0,
						mtimeMs: e.isFile() ? (await lstat(join(dir, e.name))).mtimeMs : 0,
						isLink: e.isSymbolicLink(),
					})),
				);
			},
		},
		process: { run, spawn: request => spawned(request.argv) },
		env: { get: async name => (name === "HOME" ? home : undefined) },
		session: {
			root: async () => setup.project,
			cwd: async () => setup.project,
			id: async () => setup.sessions.claude.id,
		},
		plugin: { root: plugin },
		tool: { register: async spec => void registered.push(spec) },
		ui: { invalidate: () => undefined },
	};
}

/** Runs the event's hooks, each over the next, down to `base`: Claude Code's own step. */
async function fire(engine: Engine, event: string, e: unknown, base: Next): Promise<unknown> {
	const hooks = engine.chain.get(event) ?? [];
	const at =
		(i: number): Next =>
		async next => {
			const hook = hooks[i];
			if (hook === undefined) return base(next);
			const answer: unknown = await Reflect.apply(hook, undefined, [engine.$, next, at(i + 1)]);
			return answer;
		};
	return at(0)(e);
}

function field(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/** Claude Code's answer to a tool call no hook answered. */
const unanswered = async () => ({ deny: "no tool.call hook answered" });

async function start(engine: Engine, scenario: Scenario): Promise<Seen[]> {
	await fire(engine, "session.start", { cwd: "", surface: null, isInteractive: false }, async e => ({
		cwd: field(e, "cwd"),
	}));
	const seen: Seen[] = engine.registered.map(spec =>
		describedTool(
			{
				name: `mcp__${scenario.plugin}__${spec.name}`,
				plain: spec.name,
				description: spec.description,
				schema: spec.inputSchema,
			},
			scenario.operations,
			spec.isDeferred === false ? "always" : "on search",
		),
	);
	const { value, ids } = await scenario.traceMessages(() =>
		fire(engine, "prompt.context", { blocks: [] }, async e => e),
	);
	const blocks = field(value, "blocks");
	for (const block of Array.isArray(blocks) ? blocks : []) {
		const text = field(block, "text");
		const label = `a block of the context, under # ${String(field(block, "name"))}`;
		if (typeof text === "string") seen.push({ kind: "text", label, text, ids });
	}
	return seen;
}

async function call(engine: Engine, step: Step & { kind: "call" }, scenario: Scenario): Promise<Seen[]> {
	const e = { tool: `mcp__${scenario.plugin}__${step.tool}`, tool_use_id: "toolu_1", ...step.input };
	const { value, ids } = await scenario.traceMessages(() => fire(engine, "tool.call", e, unanswered));
	const deny = field(value, "deny");
	// Claude Code wraps a refusal in <tool_use_error>, as the page's introduction says.
	if (typeof deny === "string") return [{ kind: "text", label: "a tool error", text: deny, ids }];
	const result = field(value, "result");
	return [
		{
			kind: "text",
			label: "the tool's result",
			text: typeof result === "string" ? result : JSON.stringify(result),
			ids,
		},
	];
}

/** What Claude Code gives the model at each step. */
export async function recordClaude(
	register: Register,
	scenario: Scenario,
	setup: Setup,
	at: { home: string; plugin: string },
): Promise<Seen[][]> {
	const chain = new Map<string, Function[]>();
	const on = (event: string, a: unknown, b?: unknown): void => {
		const hook = typeof a === "function" ? a : b;
		if (typeof hook === "function") chain.set(event, [...(chain.get(event) ?? []), hook]);
	};
	register(on, {});
	const registered: ToolSpec[] = [];
	const engine: Engine = { $: apiOf(at.home, setup, at.plugin, registered), chain, registered };
	const out: Seen[][] = [];
	for (const step of scenario.steps)
		out.push(step.kind === "start" ? await start(engine, scenario) : await call(engine, step, scenario));
	return out;
}
