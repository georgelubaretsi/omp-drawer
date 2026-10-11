import { askCallsOf, formatAsk } from "./ask";
import { asArray, asObject, asString, type JsonObject, parseLine, textOf } from "./json";
import { contentText, type Message, messageOf } from "./journal";
import { templates } from "./templates";

/** What a page or a search shows besides the user's words and the agent's text. */
export interface Flags {
	user: boolean;
	thinking: boolean;
	tools: boolean;
	raw: boolean;
}

type Part = { text: string; limit: number };

/** One journal line as a page shows it; each part is cut to its limit when printed. */
export interface Rendered {
	line: number;
	raw: string;
	kind: string;
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

/** The `ask` calls seen so far while a journal streams by, so an answer can show its question. */
export class AskCalls {
	readonly #calls = new Map<string, AskCall>();

	/** Records the ask calls of one journal line. Cheap for lines that can't hold one. */
	observe(raw: string, line: number, entry?: JsonObject): void {
		if (!raw.includes('"ask"')) return;
		const parsed = entry ?? parseLine(raw);
		const message = messageOf(parsed);
		if (message?.role !== "assistant") return;
		for (const call of askCallsOf(message.content))
			this.#calls.set(call.id, { line, timestamp: textOf(parsed?.timestamp), args: call.args });
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
export function answerAsk(message: AskAnswerMessage, asks: AskCalls): string {
	return formatAsk(asks.get(message.toolCallId)?.args, {
		details: message.details,
		text: contentText(message.content),
	});
}

/** The name a header shows for a kind of entry, from header.md. */
export function kindName(kind: string, values?: Record<string, unknown>): string {
	return templates.header.text(`kinds.${kind}`, values);
}

/** The kind shown for a line that is neither a message the reader knows nor a tool result. */
export function otherKind(entry: JsonObject | undefined, message: Message | undefined): string {
	if (message !== undefined) return kindName("otherMessage", { role: message.role });
	return kindName("other", {
		type: asString(entry?.customType) ?? asString(entry?.type) ?? kindName("unparsable"),
	});
}

// One block of an agent message: its text, an ask, and thinking or other tool calls when shown.
function blockPart(block: JsonObject, show: { thinking: boolean; tools: boolean }): Part | undefined {
	switch (block.type) {
		case "text":
			return block.text ? { text: textOf(block.text), limit: MESSAGE_LIMIT } : undefined;
		case "thinking":
			return show.thinking && block.thinking
				? { text: templates.entry.text("thinking", { text: textOf(block.thinking) }), limit: DETAIL_LIMIT }
				: undefined;
		case "toolCall":
			if (block.name === "ask")
				return { text: templates.entry.text("ask", { ask: formatAsk(block.arguments) }), limit: WHOLE };
			return show.tools
				? {
						text: templates.entry.text("toolCall", {
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

// A tool result (shown with tools) or a message of another kind (shown only when requested).
function otherMessageParts(message: Message, view: Flags & { force: boolean }): Shown | undefined {
	const text = contentText(message.content);
	if (message.role === "toolResult")
		return view.force || view.tools
			? {
					kind: kindName("toolResult", { tool: textOf(message.toolName) }),
					parts: [{ text, limit: DETAIL_LIMIT }],
				}
			: undefined;
	return view.force ? { kind: otherKind(undefined, message), parts: [{ text, limit: MESSAGE_LIMIT }] } : undefined;
}

function messageParts(message: Message, view: Flags & { force: boolean }, asks: AskCalls): Shown | undefined {
	if (message.role === "user")
		return { kind: kindName("user"), parts: [{ text: contentText(message.content), limit: MESSAGE_LIMIT }] };
	if (isAskAnswer(message))
		return { kind: kindName("askAnswer"), parts: [{ text: answerAsk(message, asks), limit: WHOLE }] };
	if (view.user && !view.force) return undefined;
	if (message.role !== "assistant") return otherMessageParts(message, view);
	const parts = assistantParts(message, { thinking: view.force || view.thinking, tools: view.force || view.tools });
	return parts.length > 0 || view.force ? { kind: kindName("assistant"), parts } : undefined;
}

/**
 * What a page shows of one journal line: the user's messages and asks with their answers, the
 * agent's text; thinking and tool calls and results when asked; with `user`, the user's words
 * only. Undefined when the flags leave nothing. `force` shows a requested line with all it holds.
 */
export function renderEntry(
	at: { raw: string; line: number; force: boolean },
	flags: Flags,
	asks: AskCalls,
): Rendered | undefined {
	const entry = parseLine(at.raw);
	const message = messageOf(entry);
	const view = { ...flags, force: at.force };
	let shown: Shown | undefined;
	if (message !== undefined) shown = messageParts(message, view, asks);
	else if (at.force) shown = { kind: otherKind(entry, undefined), parts: [] };
	return shown === undefined
		? undefined
		: { line: at.line, raw: at.raw, kind: shown.kind, timestamp: textOf(entry?.timestamp), parts: shown.parts };
}

/** An entry's header line. */
export function entryHeader(line: number, kind: string, timestamp: string): string {
	return templates.header.render({ line, kind, timestamp });
}

/** An entry's header and its parts, each cut in the middle to its limit so its start and end stay. */
export function formatEntry(entry: Rendered): string {
	const parts = entry.parts.map(({ text, limit }) => {
		if (text.length <= limit) return text;
		const half = Math.floor(limit / 2);
		const cut = { start: text.slice(0, half), count: text.length - 2 * half, end: text.slice(-half) };
		return templates.entry.text("cut", cut);
	});
	return templates.entry.render({ header: entryHeader(entry.line, entry.kind, entry.timestamp), parts });
}
