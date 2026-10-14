// A Codex journal (~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl) as the omp entries its
// lines stand for. The mapping follows omp's own import of Codex sessions
// (packages/coding-agent/src/session/codex-session-store.ts; NOTICE.md): response items carry the
// conversation, event messages fill in what they lack, and a rollback drops the turns it undoes.
import { asArray, asObject, asString, type JsonObject } from "../json";
import type { ToolNames } from "./claude";

/** The texts and calls the response items already carry, so an event repeating one is skipped. */
export interface Canonical {
	readonly users: Set<string>;
	readonly assistants: Set<string>;
	readonly calls: Set<string>;
}

export function emptyCanonical(): Canonical {
	return { users: new Set(), assistants: new Set(), calls: new Set() };
}

function texts(content: unknown): JsonObject[] {
	return asArray(content).flatMap(item => {
		const i = asObject(item);
		const text = asString(i?.text);
		if ((i?.type === "input_text" || i?.type === "output_text" || i?.type === "text") && text !== undefined)
			return [{ type: "text", text }];
		return i?.type === "input_image" ? [{ type: "image" }] : [];
	});
}

function joined(content: unknown): string {
	return texts(content)
		.map(part => asString(part.text) ?? "")
		.join("");
}

function reasoning(payload: JsonObject): JsonObject[] {
	return ["summary", "content"].flatMap(key =>
		asArray(payload[key]).flatMap(item => {
			const text = asString(asObject(item)?.text);
			return text ? [{ type: "thinking", thinking: text }] : [];
		}),
	);
}

function args(value: unknown): JsonObject {
	const object = asObject(value);
	if (object !== undefined || typeof value !== "string") return object ?? {};
	try {
		return asObject(JSON.parse(value)) ?? { input: value };
	} catch {
		return { input: value };
	}
}

function outputContent(value: unknown): JsonObject[] {
	const structured = texts(value);
	if (structured.length > 0) return structured;
	if (value === undefined) return [];
	return [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }];
}

function noteMessage(canonical: Canonical, p: JsonObject): void {
	const text = joined(p.content);
	if (!text) return;
	if (p.role === "user") canonical.users.add(text);
	if (p.role === "assistant") canonical.assistants.add(text);
}

/** Notes what one record carries; a pass over the whole journal makes its Canonical. */
export function noteCanonical(canonical: Canonical, record: JsonObject): void {
	const p = record.type === "response_item" ? asObject(record.payload) : undefined;
	if (p === undefined) return;
	const callId = asString(p.call_id) ?? asString(p.id);
	if (callId && asString(p.type)?.includes("call")) canonical.calls.add(callId);
	if (p.type === "message") noteMessage(canonical, p);
	if (p.type === "reasoning") for (const part of reasoning(p)) canonical.assistants.add(asString(part.thinking) ?? "");
}

const assistant = (content: JsonObject[]): JsonObject => ({ role: "assistant", content });
const call = (id: string, name: string, input: unknown): JsonObject => ({
	type: "toolCall",
	id,
	name,
	arguments: args(input),
});
const result = (id: string, name: string, content: JsonObject[], isError = false): JsonObject => ({
	role: "toolResult",
	toolCallId: id,
	toolName: name,
	content,
	isError,
});

function callItem(p: JsonObject, tools: ToolNames): JsonObject[] {
	const id = asString(p.call_id) ?? asString(p.id);
	const custom = p.type === "custom_tool_call";
	const search = p.type === "web_search_call" || p.type === "tool_search_call";
	const name = search ? (p.type === "web_search_call" ? "web_search" : "tool_search") : asString(p.name);
	if (!id || !name) return [];
	tools.set(id, name);
	const input = custom ? p.input : search && p.type === "web_search_call" ? p.action : p.arguments;
	return [assistant([call(id, name, input)])];
}

function outputItem(p: JsonObject, tools: ToolNames): JsonObject[] {
	const id = asString(p.call_id);
	if (!id) return [];
	if (p.type === "tool_search_output")
		return [result(id, tools.get(id) ?? "tool_search", outputContent(p.tools), p.status === "failed")];
	return [result(id, tools.get(id) ?? "unknown", outputContent(p.output))];
}

/** The messages a response item stands for. */
export function responseMessages(p: JsonObject, tools: ToolNames): JsonObject[] {
	const type = asString(p.type) ?? "";
	if (type === "message") {
		const content = texts(p.content);
		if (content.length === 0) return [];
		if (p.role === "user") return [{ role: "user", content }];
		return p.role === "assistant" ? [assistant(content)] : [];
	}
	if (type === "reasoning") return reasoning(p).length > 0 ? [assistant(reasoning(p))] : [];
	if (["function_call", "custom_tool_call", "web_search_call", "tool_search_call"].includes(type))
		return callItem(p, tools);
	if (["function_call_output", "custom_tool_call_output", "tool_search_output"].includes(type))
		return outputItem(p, tools);
	return [];
}

/** An MCP call's result: its error, or its content and whether it failed. */
function mcpResult(r: JsonObject | undefined): { content: JsonObject[]; isError: boolean } {
	const error = asString(r?.Err);
	if (error !== undefined) return { content: [{ type: "text", text: error }], isError: true };
	const ok = asObject(r?.Ok) ?? r;
	return { content: outputContent(ok?.content ?? ok), isError: ok?.isError === true };
}

function mcpCall(p: JsonObject, tools: ToolNames): JsonObject[] {
	const id = asString(p.call_id);
	const invocation = asObject(p.invocation);
	const server = asString(invocation?.server);
	const tool = asString(invocation?.tool);
	if (!id || !server || !tool) return [];
	const name = `${server}/${tool}`;
	tools.set(id, name);
	const { content, isError } = mcpResult(asObject(p.result));
	return [assistant([call(id, name, invocation?.arguments)]), result(id, name, content, isError)];
}

function webSearchEnd(p: JsonObject, tools: ToolNames, canonical: Canonical): JsonObject[] {
	const id = asString(p.call_id);
	if (!id) return [];
	const name = tools.get(id) ?? "web_search";
	const found = result(id, name, outputContent(p.results ?? p.query));
	if (canonical.calls.has(id) || tools.has(id)) return [found];
	tools.set(id, name);
	return [assistant([call(id, name, p.action ?? p.query)]), found];
}

/** A user's or the agent's words or thinking, unless a response item carries them; undefined for other events. */
function wordsEvent(p: JsonObject, canonical: Canonical): JsonObject[] | undefined {
	const text = asString(p.message) ?? asString(p.text);
	if (p.type === "user_message") return text && !canonical.users.has(text) ? [{ role: "user", content: text }] : [];
	if (p.type !== "agent_message" && p.type !== "agent_reasoning") return undefined;
	if (!text || canonical.assistants.has(text)) return [];
	return [assistant([p.type === "agent_message" ? { type: "text", text } : { type: "thinking", thinking: text }])];
}

function dynamicCall(p: JsonObject, id: string, tools: ToolNames): JsonObject[] {
	if (p.type === "dynamic_tool_call_request" && typeof p.tool === "string") {
		tools.set(id, p.tool);
		return [assistant([call(id, p.tool, p.arguments)])];
	}
	if (p.type !== "dynamic_tool_call_response") return [];
	const error = asString(p.error);
	const content = error ? [{ type: "text", text: error }] : outputContent(p.content_items);
	const name = tools.get(id) ?? asString(p.tool) ?? "unknown";
	return [result(id, name, content, error !== undefined || p.success === false)];
}

/** The messages an event stands for, when the response items don't carry them already. */
export function eventMessages(p: JsonObject, tools: ToolNames, canonical: Canonical): JsonObject[] {
	const words = wordsEvent(p, canonical);
	if (words !== undefined) return words;
	const id = asString(p.call_id) ?? asString(p.callId);
	if (id && canonical.calls.has(id)) return [];
	if (p.type === "web_search_end") return webSearchEnd(p, tools, canonical);
	if (p.type === "mcp_tool_call_end") return mcpCall(p, tools);
	return id ? dynamicCall(p, id, tools) : [];
}
