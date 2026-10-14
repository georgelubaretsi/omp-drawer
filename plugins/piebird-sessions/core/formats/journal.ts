// A journal's lines, from any agent, as omp entries: omp's lines as they are, Claude Code's and
// Codex's converted (claude.ts, codex.ts). Each keeps its own line number and text, so a page cites
// the file as it is and `raw` shows it unchanged. Journals run to hundreds of megabytes, so they are
// read as a stream of lines, never held whole; a Codex journal takes a first pass for what its
// response items carry and, after a rollback, one for the turns it undid.
import { asObject, asString, type JsonObject, parseLine } from "../json";
import { claudeEntries, type ToolNames } from "./claude";
import { type Canonical, emptyCanonical, eventMessages, noteCanonical, responseMessages } from "./codex";

export type Format = "omp" | "claude" | "codex";

/** Opens the journal's text in pieces (Io.readPieces), once for each pass over it. */
export type Opener = () => Promise<AsyncIterable<string>>;

export interface Line {
	/** 1-based. */
	readonly line: number;
	readonly raw: string;
	/** The omp entries the line stands for: none for a line no reader shows, several for some. */
	readonly entries: readonly JsonObject[];
}

/** The text's lines without their line ends, as its pieces come. */
export async function* linesOf(pieces: AsyncIterable<string>): AsyncGenerator<string> {
	let held: string[] = [];
	for await (const piece of pieces) {
		let start = 0;
		for (let end = piece.indexOf("\n"); end >= 0; end = piece.indexOf("\n", start)) {
			held.push(piece.slice(start, end));
			yield held.join("");
			held = [];
			start = end + 1;
		}
		if (start < piece.length) held.push(piece.slice(start));
	}
	if (held.length > 0) yield held.join("");
}

const CODEX_TYPES = new Set(["session_meta", "response_item", "event_msg", "turn_context"]);
/** Records read at most to tell which agent wrote a journal. */
const FORMAT_RECORDS = 50;

function formatOfRecord(record: JsonObject | undefined): Format | undefined {
	if (record === undefined) return undefined;
	if (CODEX_TYPES.has(asString(record.type) ?? "")) return "codex";
	if (typeof record.sessionId === "string") return "claude";
	return record.type === "session" ? "omp" : undefined;
}

/** Which agent wrote the journal, from its first records. */
async function formatOf(open: Opener): Promise<Format> {
	let read = 0;
	for await (const raw of linesOf(await open())) {
		const format = formatOfRecord(parseLine(raw));
		if (format !== undefined) return format;
		if (++read >= FORMAT_RECORDS) break;
	}
	return "omp";
}

function codexEntries(record: JsonObject, tools: ToolNames, canonical: Canonical): JsonObject[] {
	const payload = asObject(record.payload);
	if (payload === undefined) return [];
	if (record.type === "event_msg" && payload.type === "thread_name_updated") {
		const title = asString(payload.thread_name);
		return title ? [{ type: "title", title }] : [];
	}
	const messages =
		record.type === "response_item"
			? responseMessages(payload, tools)
			: record.type === "event_msg"
				? eventMessages(payload, tools, canonical)
				: [];
	return messages.map(message => ({ type: "message", timestamp: record.timestamp, message }));
}

/** What each record stands for, in one pass that learns the journal's tool names as it goes. */
function converter(format: Format, canonical: Canonical): (record: JsonObject) => JsonObject[] {
	const tools: ToolNames = new Map();
	if (format === "omp") return record => [record];
	if (format === "claude") return record => claudeEntries(record, tools);
	return record => codexEntries(record, tools, canonical);
}

async function* convertedLines(
	open: Opener,
	convert: (record: JsonObject) => JsonObject[],
	dropped: ReadonlySet<number>,
): AsyncGenerator<Line> {
	let line = 0;
	for await (const raw of linesOf(await open())) {
		line++;
		const record = parseLine(raw);
		const entries = record === undefined ? [] : convert(record);
		yield { line, raw, entries: dropped.has(line) ? [] : entries };
	}
}

function rollbackOf(record: JsonObject): number {
	const p = record.type === "event_msg" ? asObject(record.payload) : undefined;
	return p?.type === "thread_rolled_back" && typeof p.num_turns === "number" ? p.num_turns : 0;
}

/** Codex's first pass: what its response items carry, and whether a rollback undid turns. */
async function codexPlan(open: Opener): Promise<{ canonical: Canonical; rollbacks: boolean }> {
	const canonical = emptyCanonical();
	let rollbacks = false;
	for await (const raw of linesOf(await open())) {
		const record = parseLine(raw);
		if (record === undefined) continue;
		noteCanonical(canonical, record);
		rollbacks ||= rollbackOf(record) > 0;
	}
	return { canonical, rollbacks };
}

/** The lines Codex's rollbacks undid: each takes back its last turns, back to their user message. */
async function droppedLines(open: Opener, canonical: Canonical): Promise<Set<number>> {
	const convert = converter("codex", canonical);
	const live: { line: number; user: boolean }[] = [];
	const dropped = new Set<number>();
	let line = 0;
	for await (const raw of linesOf(await open())) {
		line++;
		const record = parseLine(raw);
		if (record === undefined) continue;
		let left = rollbackOf(record);
		while (left > 0) {
			const undone = live.pop();
			if (undone === undefined) break;
			dropped.add(undone.line);
			if (undone.user) left--;
		}
		const entries = convert(record);
		if (entries.length > 0) live.push({ line, user: entries.some(e => asObject(e.message)?.role === "user") });
	}
	return dropped;
}

/** The journal's lines with what each stands for. */
export async function* journalLines(open: Opener): AsyncGenerator<Line> {
	const format = await formatOf(open);
	if (format !== "codex") {
		yield* convertedLines(open, converter(format, emptyCanonical()), new Set());
		return;
	}
	const { canonical, rollbacks } = await codexPlan(open);
	const dropped = rollbacks ? await droppedLines(open, canonical) : new Set<number>();
	yield* convertedLines(open, converter("codex", canonical), dropped);
}

/**
 * The journal's first lines, until `limit` characters are read, converted without Codex's passes
 * over the whole journal: enough for a title or the first prompt, where a repeat doesn't matter.
 */
export async function* headLines(open: Opener, limit: number): AsyncGenerator<Line> {
	const format = await formatOf(open);
	let read = 0;
	for await (const line of convertedLines(open, converter(format, emptyCanonical()), new Set())) {
		yield line;
		read += line.raw.length + 1;
		if (read >= limit) return;
	}
}
