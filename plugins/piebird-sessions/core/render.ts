// What a page or a search shows of one journal item, and how an entry is laid out.
import { joinText, type ModelText } from "../kit/core/model";
import { askCallsOf, formatAsk } from "./ask";
import { contentText, type Item, type Message, messageOf } from "./journal";
import { asArray, asObject, asString, type JsonObject, textOf } from "./json";
import { model } from "./model.gen";

/** What a page or a search shows besides the user's words and the agent's text. */
export interface Flags {
	user: boolean;
	thinking: boolean;
	tools: boolean;
	raw: boolean;
}

interface Part {
	text: ModelText;
	limit: number;
}

/** One item as a page shows it; each part is cut to its limit when printed. */
export interface Rendered {
	line: number;
	raw: string;
	kind: ModelText;
	timestamp: string;
	parts: Part[];
}

/** How much of an entry a page shows: a message, and thinking or tool output. */
const MESSAGE_LIMIT = 1500;
const DETAIL_LIMIT = 800;
/** Asks are shown whole. */
const WHOLE = Number.POSITIVE_INFINITY;

interface AskCall {
	line: number;
	timestamp: string;
	args: unknown;
}

/** The `ask` calls seen so far while a journal is read, so an answer can show its question. */
export class AskCalls {
	readonly #calls = new Map<string, AskCall>();

	observe(item: Item): void {
		const message = messageOf(item.entry);
		if (message?.role !== "assistant") return;
		for (const call of askCallsOf(message.content))
			this.#calls.set(call.id, { line: item.line, timestamp: textOf(item.entry?.timestamp), args: call.args });
	}

	get(toolCallId: string | undefined): AskCall | undefined {
		return toolCallId === undefined ? undefined : this.#calls.get(toolCallId);
	}
}

/** An answer to the agent's `ask` call. */
export type AskAnswerMessage = Message & { role: "toolResult"; toolName: "ask" };

export function isAskAnswer(message: Message | undefined): message is AskAnswerMessage {
	return message?.role === "toolResult" && message.toolName === "ask";
}

/** An answer entry's ask: the questions from the remembered call, with what was picked or typed. */
export function answerAsk(message: AskAnswerMessage, asks: AskCalls): ModelText {
	return formatAsk(asks.get(message.toolCallId)?.args, {
		details: message.details,
		text: contentText(message.content),
	});
}

/** The kind shown for an item that is neither a message the reader knows nor a tool result. */
export function otherKind(entry: JsonObject | undefined, message: Message | undefined): ModelText {
	if (message !== undefined) return model.text("kind-other-message", { role: message.role });
	const type = asString(entry?.customType) ?? asString(entry?.type) ?? model.text("kind-unparsable").text;
	return model.text("kind-other", { type });
}

// One block of an agent message: its text, an ask, and thinking or other tool calls when shown.
function blockPart(block: JsonObject, show: { thinking: boolean; tools: boolean }): Part | undefined {
	switch (block.type) {
		case "text":
			return block.text
				? { text: model.text("part-text", { text: textOf(block.text) }), limit: MESSAGE_LIMIT }
				: undefined;
		case "thinking":
			return show.thinking && block.thinking
				? { text: model.text("part-thinking", { text: textOf(block.thinking) }), limit: DETAIL_LIMIT }
				: undefined;
		case "toolCall":
			if (block.name === "ask")
				return { text: model.text("part-ask", { ask: formatAsk(block.arguments).text }), limit: WHOLE };
			return show.tools
				? {
						text: model.text("part-tool-call", {
							name: textOf(block.name),
							arguments: JSON.stringify(block.arguments ?? {}),
						}),
						limit: DETAIL_LIMIT,
					}
				: undefined;
		default:
			return undefined;
	}
}

function assistantParts(message: Message, show: { thinking: boolean; tools: boolean }): Part[] {
	const blocks = Array.isArray(message.content) ? asArray(message.content) : [{ type: "text", text: message.content }];
	return blocks.flatMap(block => {
		const fields = asObject(block);
		const part = fields === undefined ? undefined : blockPart(fields, show);
		return part === undefined ? [] : [part];
	});
}

type Shown = Pick<Rendered, "kind" | "parts">;
type View = Flags & { force: boolean };

const textPart = (text: string, limit: number): Part => ({ text: model.text("part-text", { text }), limit });

// A tool result (shown with tools) or a message of another kind (shown only when requested).
function otherMessageParts(message: Message, view: View): Shown | undefined {
	const text = contentText(message.content);
	if (message.role === "toolResult")
		return view.force || view.tools
			? {
					kind: model.text("kind-tool-result", { tool: textOf(message.toolName) }),
					parts: [textPart(text, DETAIL_LIMIT)],
				}
			: undefined;
	return view.force ? { kind: otherKind(undefined, message), parts: [textPart(text, MESSAGE_LIMIT)] } : undefined;
}

function messageParts(message: Message, view: View, asks: AskCalls): Shown | undefined {
	if (message.role === "user")
		return { kind: model.text("kind-user"), parts: [textPart(contentText(message.content), MESSAGE_LIMIT)] };
	if (isAskAnswer(message))
		return { kind: model.text("kind-ask-answer"), parts: [{ text: answerAsk(message, asks), limit: WHOLE }] };
	if (view.user && !view.force) return undefined;
	if (message.role !== "assistant") return otherMessageParts(message, view);
	const parts = assistantParts(message, { thinking: view.force || view.thinking, tools: view.force || view.tools });
	return parts.length > 0 || view.force ? { kind: model.text("kind-assistant"), parts } : undefined;
}

/**
 * What a page shows of one item: the user's messages and asks with their answers, the agent's
 * text; thinking and tool calls and results when asked; with `user`, the user's words only.
 * Undefined when the flags leave nothing. `force` shows a requested line with all it holds.
 */
export function renderItem(item: Item, view: View, asks: AskCalls): Rendered | undefined {
	const message = messageOf(item.entry);
	let shown: Shown | undefined;
	if (message !== undefined) shown = messageParts(message, view, asks);
	else if (view.force) shown = { kind: otherKind(item.entry, undefined), parts: [] };
	return shown === undefined
		? undefined
		: {
				line: item.line,
				raw: item.raw,
				kind: shown.kind,
				timestamp: textOf(item.entry?.timestamp),
				parts: shown.parts,
			};
}

export function entryHeader(line: number, kind: ModelText, timestamp: string): ModelText {
	return model.text("header", { line, kind: kind.text, timestamp });
}

/** An entry's header and its parts, each cut in the middle to its limit so its start and end stay. */
export function formatEntry(entry: Rendered): ModelText {
	const parts = entry.parts.map(({ text, limit }) => {
		if (text.text.length <= limit) return text;
		const half = Math.floor(limit / 2);
		const whole = text.text;
		return model.text("part-cut", {
			start: whole.slice(0, half),
			count: whole.length - 2 * half,
			end: whole.slice(-half),
		});
	});
	return joinText([entryHeader(entry.line, entry.kind, entry.timestamp), ...parts]);
}
