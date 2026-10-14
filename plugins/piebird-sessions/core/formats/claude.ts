// A Claude Code journal line (~/.claude/projects/<project>/<id>.jsonl) as the omp entries it
// stands for, so one reader shows every agent's sessions. The mapping follows omp's own import of
// Claude Code sessions (packages/coding-agent/src/session/claude-session-store.ts; NOTICE.md).
import { asArray, asObject, asString, type JsonObject } from "../json";

/** Tool names by call id, seen so far in the journal: Claude's results name only the call. */
export type ToolNames = Map<string, string>;

function userPart(block: unknown): JsonObject | undefined {
	const b = asObject(block);
	if (b?.type === "text" && typeof b.text === "string") return { type: "text", text: b.text };
	return b?.type === "image" ? { type: "image" } : undefined;
}

function toolUse(b: JsonObject, tools: ToolNames): JsonObject | undefined {
	const id = asString(b.id);
	const name = asString(b.name);
	if (id === undefined || name === undefined) return undefined;
	tools.set(id, name);
	return { type: "toolCall", id, name, arguments: asObject(b.input) ?? {} };
}

function assistantBlock(block: unknown, tools: ToolNames): JsonObject | undefined {
	const b = asObject(block);
	if (b?.type === "text" && typeof b.text === "string") return { type: "text", text: b.text };
	if (b?.type === "thinking" && typeof b.thinking === "string") return { type: "thinking", thinking: b.thinking };
	return b?.type === "tool_use" ? toolUse(b, tools) : undefined;
}

function toolResult(block: JsonObject, tools: ToolNames): JsonObject | undefined {
	const id = asString(block.tool_use_id);
	if (id === undefined) return undefined;
	const content =
		typeof block.content === "string"
			? [{ type: "text", text: block.content }]
			: asArray(block.content).flatMap(part => userPart(part) ?? []);
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: tools.get(id) ?? "unknown",
		content,
		isError: block.is_error === true,
	};
}

/** A user line: its words, and a tool result for each result block, in order. */
function userMessages(content: unknown, tools: ToolNames): JsonObject[] {
	if (typeof content === "string") return content === "" ? [] : [{ role: "user", content }];
	const out: JsonObject[] = [];
	let words: JsonObject[] = [];
	const flush = () => {
		if (words.length > 0) out.push({ role: "user", content: words });
		words = [];
	};
	for (const block of asArray(content)) {
		const part = userPart(block);
		if (part !== undefined) words.push(part);
		const result =
			part === undefined && asObject(block)?.type === "tool_result"
				? toolResult(asObject(block) ?? {}, tools)
				: undefined;
		if (result === undefined) continue;
		flush();
		out.push(result);
	}
	flush();
	return out;
}

function messages(record: JsonObject, tools: ToolNames): JsonObject[] {
	const message = asObject(record.message);
	if (message === undefined || record.isSidechain === true || record.isMeta === true) return [];
	if (record.type === "user") return userMessages(message.content, tools);
	if (record.type !== "assistant") return [];
	const content = asArray(message.content).flatMap(block => assistantBlock(block, tools) ?? []);
	return content.length > 0 ? [{ role: "assistant", content }] : [];
}

/** The omp entries of one Claude Code record: its messages, or the session's title. */
export function claudeEntries(record: JsonObject, tools: ToolNames): JsonObject[] {
	const title =
		record.type === "custom-title" ? record.customTitle : record.type === "ai-title" ? record.aiTitle : undefined;
	if (typeof title === "string") return [{ type: "title", title }];
	const timestamp = record.timestamp;
	return messages(record, tools).map(message => ({ type: "message", timestamp, message }));
}
