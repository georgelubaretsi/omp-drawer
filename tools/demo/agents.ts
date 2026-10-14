// The coding agents a demo can run, and how each one's session journal reads: a line becomes the
// events journal.ts follows (the user's prompt, a tool call, a tool's error, the end of a turn).
//   omp     ~/.omp/agent/sessions/<project>/<time>_<id>.jsonl: message entries (user,
//           assistant with toolCall blocks and a stopReason, toolResult with isError)
//   claude  ~/.claude/projects/<project>/<id>.jsonl: user and assistant entries (tool_use blocks,
//           stop_reason; tool_result blocks with is_error in user entries)
//   codex   $CODEX_HOME/sessions/<y>/<m>/<d>/rollout-*.jsonl: response_item payloads (user
//           messages, function and custom tool calls and outputs) and event_msg task_complete
// Codex marks no failed call: an output that says a command or script failed counts as one.

export type Agent = "omp" | "claude" | "codex";

/** What one journal line says; most lines say nothing the report uses. */
export interface Event {
	user?: string;
	calls?: { id: string; tool: string; intent: string }[];
	errors?: { id: string; text: string }[];
	end?: string;
}

export function field(value: unknown, key: string): unknown {
	return value && typeof value === "object" ? Reflect.get(value, key) : undefined;
}

export const text = (value: unknown) => (typeof value === "string" ? value : "");

const blocks = (content: unknown): unknown[] => (Array.isArray(content) ? content : []);

/** The text blocks of a message's content (a string is one). */
export function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	return blocks(content)
		.map(part => text(field(part, "text")))
		.join("\n");
}

const firstLine = (value: string) => value.trim().split("\n")[0] ?? "";

function omp(entry: unknown): Event {
	const message = field(entry, "message");
	const role = field(message, "role");
	if (role === "user") return { user: textOf(field(message, "content")) };
	if (role === "toolResult")
		return field(message, "isError") === true
			? { errors: [{ id: text(field(message, "toolCallId")), text: firstLine(textOf(field(message, "content"))) }] }
			: {};
	if (role !== "assistant") return {};
	const calls = blocks(field(message, "content"))
		.filter(part => field(part, "type") === "toolCall")
		.map(part => ({
			id: text(field(part, "id")),
			tool: text(field(part, "name")),
			intent: text(field(part, "intent")) || text(field(field(part, "arguments"), "i")),
		}));
	const reason = field(message, "stopReason");
	return { calls, end: typeof reason === "string" && reason !== "toolUse" ? reason : undefined };
}

function claude(entry: unknown): Event {
	const message = field(entry, "message");
	const content = field(message, "content");
	if (field(entry, "type") === "user") {
		const results = blocks(content).filter(part => field(part, "type") === "tool_result");
		const errors = results
			.filter(part => field(part, "is_error") === true)
			.map(part => ({ id: text(field(part, "tool_use_id")), text: firstLine(textOf(field(part, "content"))) }));
		return results.length > 0 ? { errors } : { user: textOf(content) };
	}
	if (field(entry, "type") !== "assistant") return {};
	const calls = blocks(content)
		.filter(part => field(part, "type") === "tool_use")
		.map(part => ({
			id: text(field(part, "id")),
			tool: text(field(part, "name")),
			intent: text(field(field(part, "input"), "description")),
		}));
	const reason = field(message, "stop_reason");
	return { calls, end: typeof reason === "string" && reason !== "tool_use" ? "stop" : undefined };
}

// Codex's outputs often hold JSON as text, quotes escaped: `\"exit_code\":1`, `Script failed\n`.
const CODEX_FAILED = /Process exited with code [1-9]|Script failed|\\?"exit_code\\?":\s*[1-9]|\\?"isError\\?":\s*true/;

function codexItem(payload: unknown): Event {
	const kind = field(payload, "type");
	if (kind === "message" && field(payload, "role") === "user") return { user: textOf(field(payload, "content")) };
	const id = text(field(payload, "call_id"));
	if (kind === "function_call" || kind === "custom_tool_call") {
		const args = text(field(payload, "arguments")) || text(field(payload, "input"));
		return { calls: [{ id, tool: text(field(payload, "name")), intent: firstLine(args).slice(0, 80) }] };
	}
	if (kind !== "function_call_output" && kind !== "custom_tool_call_output") return {};
	const output = field(payload, "output");
	const shown = typeof output === "string" ? output : JSON.stringify(output ?? "");
	const failed = shown.split(/\n|\\n/).find(line => CODEX_FAILED.test(line));
	return failed === undefined ? {} : { errors: [{ id, text: failed.trim().slice(0, 200) }] };
}

function codex(entry: unknown): Event {
	const payload = field(entry, "payload");
	if (field(entry, "type") === "response_item") return codexItem(payload);
	if (field(entry, "type") !== "event_msg") return {};
	const kind = field(payload, "type");
	if (kind === "task_complete") return { end: "stop" };
	return kind === "turn_aborted" ? { end: "aborted" } : {};
}

/** Reads one journal line of `agent`'s; a line it can't parse (being written) says nothing. */
export function readLine(agent: Agent, line: string): Event {
	if (line.trim() === "") return {};
	let entry: unknown;
	try {
		entry = JSON.parse(line);
	} catch {
		return {};
	}
	if (agent === "omp") return omp(entry);
	return agent === "claude" ? claude(entry) : codex(entry);
}
