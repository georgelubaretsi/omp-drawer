import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { asArray, asObject, asString, type JsonObject, parseLine, textOf } from "./json";
import { templates } from "./templates";

/** Where omp keeps session journals unless told otherwise. */
export const DEFAULT_SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");

/** One journal message, as far as the reader needs it. */
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
			return part?.type === "image" ? templates.entry.text("image") : "";
		})
		.filter(Boolean)
		.join("\n");
}

/** The journal files (`<timestamp>_<uuid>.jsonl`) whose uuid starts with `id`, under any root. */
export function findSessionFiles(id: string, roots: readonly string[]): string[] {
	const matches = new Set<string>();
	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
		const stack = [root];
		for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
			for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
				const entryPath = path.join(current, entry.name);
				if (entry.isDirectory()) stack.push(entryPath);
				else if (entry.isFile() && entry.name.match(/^[^_]+_(.+)\.jsonl$/)?.[1]?.startsWith(id))
					matches.add(entryPath);
			}
		}
	}
	return [...matches].toSorted();
}

/** At most this many sessions, and their titles, are read and listed when an id prefix names several. */
export const AMBIGUOUS_LIMIT = 10;

/**
 * The one journal a session id, id prefix or `.jsonl` path names; an error lists ambiguous
 * matches. A path may start with `~`, as the sessions.self line shows a journal under `home`.
 */
export function resolveSession(session: string, roots: readonly string[], home = os.homedir()): string {
	const given = /^~(?=$|[\\/])/.test(session) ? path.join(home, session.slice(1)) : session;
	if (given.endsWith(".jsonl") && fs.existsSync(given)) return given;
	const files = findSessionFiles(session, roots);
	const [only] = files;
	if (only === undefined) throw new Error(templates.errors.notFound.render({ session, roots }));
	if (files.length === 1) return only;
	const listed = files.slice(0, AMBIGUOUS_LIMIT).map(file => ({ file, title: sessionTitle(file) }));
	const values = { session, total: files.length, files: listed, more: files.length - listed.length };
	throw new Error(templates.errors.ambiguous.render(values));
}

// A session's title from its head: the `title` entry omp writes first, else the session
// header's. Only the first 16 KB are read.
function sessionTitle(file: string): string | undefined {
	const head = Buffer.alloc(16384);
	const descriptor = fs.openSync(file, "r");
	const length = fs.readSync(descriptor, head, 0, head.length, 0);
	fs.closeSync(descriptor);
	const entries = head.subarray(0, length).toString("utf8").split("\n").slice(0, 2).map(parseLine);
	const title =
		entries.find(entry => entry?.type === "title")?.title ?? entries.find(entry => entry?.type === "session")?.title;
	return asString(title) || undefined;
}

/** A journal read line by line, never whole; `count` is the line last returned (1-based). */
export class Journal {
	count = 0;
	readonly #input: fs.ReadStream;
	readonly #lines: readline.Interface;
	readonly #iterator: AsyncIterator<string>;

	constructor(
		readonly file: string,
		readonly signal?: AbortSignal,
	) {
		this.#input = fs.createReadStream(file);
		this.#lines = readline.createInterface({ input: this.#input, crlfDelay: Infinity });
		this.#iterator = this.#lines[Symbol.asyncIterator]();
	}

	/** The next line, or undefined at the end of the journal. */
	async next(): Promise<string | undefined> {
		this.signal?.throwIfAborted();
		const result = await this.#iterator.next();
		if (result.done === true) return undefined;
		this.count++;
		return result.value;
	}

	/** The error for a line past the end, once the journal has been read to it. */
	pastEnd(): Error {
		return new Error(templates.errors.pastEnd.render({ file: this.file, count: this.count }));
	}

	/** Stops reading; closing the interface alone would leave the file open. */
	close(): void {
		this.#lines.close();
		this.#input.destroy();
	}
}
