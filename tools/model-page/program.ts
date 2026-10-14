// The program's side of a scripted session, as Codex and the desktop apps run it: its MCP server
// over stdio (the kit's own, kit/program/mcp.ts) and its answer to Codex's SessionStart hook.
import { PassThrough } from "node:stream";
import type { Parts } from "../../kit/program/cli";
import { serveMcp } from "../../kit/program/mcp";
import { describedTool } from "./tools";
import type { Scenario, Seen, Setup, Step } from "./types";

const INITIALIZE = {
	jsonrpc: "2.0",
	id: 0,
	method: "initialize",
	params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "codex-mcp-client", version: "0" } },
};
const INITIALIZED = { jsonrpc: "2.0", method: "notifications/initialized" };

function field(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/** Sends `request` after the handshake on a new connection; the handshake's answer and the request's. */
async function exchange(parts: Parts, request: object): Promise<{ initialized: unknown; result: unknown }> {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const handle = serveMcp(parts, { stdin, stdout });
	const answers = new Map<unknown, unknown>();
	let buffered = "";
	const done = new Promise<void>(resolve => {
		stdout.on("data", (chunk: Buffer) => {
			const lines = (buffered + chunk.toString()).split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) answers.set(field(JSON.parse(line), "id"), JSON.parse(line));
			if (answers.has(1)) resolve();
		});
	});
	for (const message of [INITIALIZE, INITIALIZED, { jsonrpc: "2.0", id: 1, ...request }])
		stdin.write(`${JSON.stringify(message)}\n`);
	await done;
	await handle.close();
	return { initialized: field(answers.get(0), "result"), result: field(answers.get(1), "result") };
}

async function start(parts: Parts, scenario: Scenario, setup: Setup): Promise<Seen[]> {
	const { initialized, result } = await exchange(parts, { method: "tools/list" });
	const tools = field(result, "tools");
	const seen: Seen[] = (Array.isArray(tools) ? tools : []).map(tool => {
		const name = String(field(tool, "name"));
		const description = String(field(tool, "description"));
		// Codex 0.162 sends a plugin's MCP tools with every request, in a namespace for its server.
		return describedTool(
			{ name, plain: name, description, schema: field(tool, "inputSchema") },
			scenario.operations,
			"always",
		);
	});
	const instructions = field(initialized, "instructions");
	if (typeof instructions === "string")
		seen.push({ kind: "text", label: "the MCP server's instructions", text: instructions, ids: [] });
	if (parts.hook === undefined) return seen;
	const session = setup.sessions.codex;
	const input = {
		sessionId: session.id,
		cwd: setup.project,
		hookEventName: "SessionStart",
		transcriptPath: session.file,
	};
	const { value, ids } = await scenario.traceMessages(async () => parts.hook?.(input));
	const context = field(field(JSON.parse(value?.stdout || "{}"), "hookSpecificOutput"), "additionalContext");
	if (typeof context === "string")
		seen.push({
			kind: "text",
			label: "the SessionStart hook's context, where Codex runs plugin hooks",
			text: context,
			ids,
		});
	return seen;
}

async function call(parts: Parts, step: Step & { kind: "call" }, scenario: Scenario): Promise<Seen[]> {
	const request = { method: "tools/call", params: { name: step.tool, arguments: step.input } };
	const { value, ids } = await scenario.traceMessages(() => exchange(parts, request));
	const content = field(value.result, "content");
	const texts = Array.isArray(content) ? content.map(part => field(part, "text")) : [];
	const text = texts.map(part => (typeof part === "string" ? part : "")).join("\n");
	return [
		{
			kind: "text",
			label: field(value.result, "isError") === true ? "a tool error" : "the tool's result",
			text,
			ids,
		},
	];
}

/** What the program gives the model at each step, as Codex and the desktop apps run it. */
export async function recordProgram(
	partsOf: (setup: Setup) => Parts | Promise<Parts>,
	scenario: Scenario,
	setup: Setup,
): Promise<Seen[][]> {
	const parts = await partsOf(setup);
	const out: Seen[][] = [];
	for (const step of scenario.steps)
		out.push(step.kind === "start" ? await start(parts, scenario, setup) : await call(parts, step, scenario));
	return out;
}
