// A journal read for a call, as a stream: its items, one per entry a line stands for
// (formats/journal.ts), or the line's own record when it stands for none, so a page can still
// show it as it is.
import { journalLines, type Line, type Opener } from "./formats/journal";
import { asArray, asObject, asString, type JsonObject, parseLine, textOf } from "./json";
import { model } from "./model.gen";
import { ReadError } from "./text";

/** One message of an entry, as far as the reader needs it. */
export interface Message {
	role: string;
	content: unknown;
	toolName?: string;
	toolCallId?: string;
	details?: unknown;
}

export function messageOf(entry: JsonObject | undefined): Message | undefined {
	if (entry?.type !== "message") return undefined;
	const message = asObject(entry.message);
	const role = asString(message?.role);
	if (message === undefined || role === undefined) return undefined;
	return {
		role,
		content: message.content,
		toolName: asString(message.toolName),
		toolCallId: asString(message.toolCallId),
		details: message.details,
	};
}

/** A message's text blocks (images as a marker); tool calls and thinking are not text. */
export function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	return asArray(content)
		.map(block => {
			const part = asObject(block);
			if (part?.type === "text") return textOf(part.text);
			return part?.type === "image" ? model.text("part-image").text : "";
		})
		.filter(Boolean)
		.join("\n");
}

export interface Item {
	/** The journal line it comes from, 1-based. */
	line: number;
	raw: string;
	entry: JsonObject | undefined;
}

function itemsOf(l: Line): Item[] {
	return l.entries.length > 0
		? l.entries.map(entry => ({ line: l.line, raw: l.raw, entry }))
		: [{ line: l.line, raw: l.raw, entry: parseLine(l.raw) }];
}

/**
 * A journal's items in order. `count` is the line of the item last returned; once the journal is
 * read to its end, its last line.
 */
export class Journal {
	count = 0;
	readonly #lines: AsyncGenerator<Line>;
	#pending: Item[] = [];

	constructor(
		readonly file: string,
		open: Opener,
	) {
		this.#lines = journalLines(open);
	}

	/** The next item, or undefined at the end of the journal. */
	async next(): Promise<Item | undefined> {
		while (this.#pending.length === 0) {
			const step = await this.#lines.next();
			if (step.done === true) return undefined;
			this.#pending = itemsOf(step.value);
		}
		const item = this.#pending.shift();
		if (item !== undefined) this.count = item.line;
		return item;
	}

	/** Stops reading: a call done before the journal's end closes the file. */
	async close(): Promise<void> {
		await this.#lines.return(undefined);
	}

	/** The error for a line past the end, once the journal is read to its end. */
	pastEnd(): ReadError {
		return new ReadError("past-end", model.text("error-past-end", { file: this.file, count: this.count }));
	}
}
