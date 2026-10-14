// omp's side of a scripted session: the plugin's extension loaded with a stand-in for omp's
// extension API; what it registers, what it adds before the agent's first turn, and its tools'
// answers.
import { dirname } from "node:path";
import { describedTool } from "./tools";
import type { Scenario, Seen, Setup, Step } from "./types";

interface OmpTool {
	readonly name: string;
	readonly description: string;
	readonly parameters: unknown;
	readonly loadMode?: string;
	execute(
		id: string,
		params: unknown,
		signal: undefined,
		onUpdate: undefined,
		ctx: unknown,
	): Promise<{ content: readonly { type: string; text?: string }[]; isError?: boolean }>;
}

type BeforeStart = (
	event: { systemPrompt: string[]; prompt: string },
	ctx: unknown,
) => Promise<{ message?: { content?: unknown }; systemPrompt?: string[] } | undefined> | undefined;

/** omp's extension context for the scenario's session, as the shells read it. */
function contextOf(setup: Setup) {
	return {
		cwd: setup.project,
		hasUI: false,
		agent: { kind: "main" },
		ui: { notify: () => undefined },
		sessionManager: {
			getSessionDir: () => dirname(setup.sessions.omp.file),
			getSessionFile: () => setup.sessions.omp.file,
			getSessionId: () => setup.sessions.omp.id,
			getHeader: () => ({}),
			getBranch: () => [],
		},
	};
}

type SessionStart = (event: object, ctx: unknown) => unknown;

interface Loaded {
	readonly tools: Map<string, OmpTool>;
	readonly sessionStarts: SessionStart[];
	readonly starts: BeforeStart[];
}

/** The extension loaded: the tools it registers and its session_start and before_agent_start handlers. */
function load(extension: (pi: never, setup: Setup) => void, setup: Setup): Loaded {
	const loaded: Loaded = { tools: new Map(), sessionStarts: [], starts: [] };
	let active = ["read", "write", "web_search"];
	const pi = {
		setLabel: () => undefined,
		registerTool: (tool: OmpTool) => void loaded.tools.set(tool.name, tool),
		on: (event: string, handler: BeforeStart & SessionStart) => {
			if (event === "before_agent_start") loaded.starts.push(handler);
			if (event === "session_start") loaded.sessionStarts.push(handler);
		},
		getActiveTools: () => [...active],
		setActiveTools: async (names: string[]) => {
			active = [...names];
		},
	};
	// The extension's parameter is omp's ExtensionAPI; this stand-in has the part the shells use.
	Reflect.apply(extension, undefined, [pi, setup]);
	return loaded;
}

async function start(loaded: Loaded, scenario: Scenario, ctx: unknown): Promise<Seen[]> {
	for (const handler of loaded.sessionStarts) await handler({ type: "session_start" }, ctx);
	const seen: Seen[] = [...loaded.tools.values()].map(tool =>
		describedTool(
			{ name: tool.name, plain: tool.name, description: tool.description, schema: tool.parameters },
			scenario.operations,
			tool.loadMode === "essential" ? "always" : "on search",
		),
	);
	for (const handler of loaded.starts) {
		const { value, ids } = await scenario.traceMessages(async () => handler({ systemPrompt: [], prompt: "" }, ctx));
		const content = value?.message?.content;
		if (typeof content === "string")
			seen.push({ kind: "text", label: "a message in the chat before the turn", text: content, ids });
		for (const added of value?.systemPrompt ?? [])
			seen.push({ kind: "text", label: "added to the system prompt", text: added, ids });
	}
	return seen;
}

async function call(
	tool: OmpTool | undefined,
	step: Step & { kind: "call" },
	scenario: Scenario,
	ctx: unknown,
): Promise<Seen[]> {
	if (tool === undefined) throw new Error(`omp: the extension registers no tool ${step.tool}`);
	const { value, ids } = await scenario.traceMessages(() =>
		tool.execute("call-1", step.input, undefined, undefined, ctx),
	);
	const text = value.content.map(part => part.text ?? "").join("\n");
	return [{ kind: "text", label: value.isError === true ? "a tool error" : "the tool's result", text, ids }];
}

/** What omp gives the model at each step. */
export async function recordOmp(
	extension: (pi: never, setup: Setup) => void,
	scenario: Scenario,
	setup: Setup,
): Promise<Seen[][]> {
	const loaded = load(extension, setup);
	const ctx = contextOf(setup);
	const out: Seen[][] = [];
	for (const step of scenario.steps) {
		out.push(
			step.kind === "start"
				? await start(loaded, scenario, ctx)
				: await call(loaded.tools.get(step.tool), step, scenario, ctx),
		);
	}
	return out;
}
