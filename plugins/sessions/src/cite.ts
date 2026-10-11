// One line and what it relates to: a user's message with the agent text it answered (or the
// user's words it follows), an ask answer with its whole ask, an ask question with its answer.
// templates/line.md lays it out.
import { askCallsOf, formatAsk } from "./ask";
import { type JsonObject, parseLine, textOf } from "./json";
import { contentText, type Journal, type Message, messageOf } from "./journal";
import { nextCall, type ReadParams } from "./read";
import { answerAsk, AskCalls, entryHeader, isAskAnswer, kindName, otherKind } from "./render";
import { templates } from "./templates";

/** What the answered agent text keeps: its end, where the question is. */
const ANSWERED_TAIL = 1500;
/** How far a question's line looks ahead for its answer (it is normally the next message). */
const LOOKAHEAD = 200;

interface Earlier {
	line: number;
	timestamp: string;
	/** Who wrote it, as a kind header.md names. */
	kind: "assistant" | "user" | "askAnswer";
	text: string;
}

interface AskShown {
	ask: string;
	answered?: { line: number; timestamp: string };
	/** No answer because the session ends first. */
	ended: boolean;
}

/** What line.md shows of the line besides its file and header. */
interface Described {
	kind: string;
	/** The entry's own text, when shown. */
	text?: string;
	/** A user's message: the latest message with text before it. */
	user?: { before?: { answers: boolean; header: string; cut: boolean; text: string } };
	/** An ask answer: its question's header, and the whole ask. */
	answer?: { asked?: string; ask: string };
	/** An agent message's asks, each with the line of its answer. */
	asks?: AskShown[];
}

// The latest message with text before the line, and the ask calls seen so far.
function remember(raw: string, line: number, asks: AskCalls): Earlier | undefined {
	const entry = parseLine(raw);
	asks.observe(raw, line, entry);
	const message = messageOf(entry);
	const timestamp = textOf(entry?.timestamp);
	if (message?.role === "assistant" || message?.role === "user") {
		const text = contentText(message.content);
		return text ? { line, timestamp, kind: message.role, text } : undefined;
	}
	return isAskAnswer(message) ? { line, timestamp, kind: "askAnswer", text: answerAsk(message, asks) } : undefined;
}

// What a user's message answers (the end of the agent's text) or follows (the user's own words).
function relation(before: Earlier | undefined): NonNullable<Described["user"]> {
	if (before === undefined) return { before: undefined };
	const answers = before.kind === "assistant";
	const cut = answers && before.text.length > ANSWERED_TAIL;
	return {
		before: {
			answers,
			header: entryHeader(before.line, kindName(before.kind), before.timestamp),
			cut,
			text: cut ? before.text.slice(-ANSWERED_TAIL) : before.text,
		},
	};
}

// An ask call followed to its answer, a few lines on.
async function askWithAnswer(journal: Journal, call: { id: string; args: unknown }): Promise<AskShown> {
	const stop = journal.count + LOOKAHEAD;
	for (let raw = await journal.next(); raw !== undefined && journal.count <= stop; raw = await journal.next()) {
		if (!raw.includes(call.id)) continue;
		const entry = parseLine(raw);
		const message = messageOf(entry);
		if (!isAskAnswer(message) || message.toolCallId !== call.id) continue;
		const answer = { details: message.details, text: contentText(message.content) };
		const answered = { line: journal.count, timestamp: textOf(entry?.timestamp) };
		return { ask: formatAsk(call.args, answer), answered, ended: false };
	}
	return { ask: formatAsk(call.args), answered: undefined, ended: journal.count < stop };
}

// An agent message: its text, and each ask it makes with the answer that followed.
async function assistantLines(message: Message, journal: Journal): Promise<Described> {
	const calls = askCallsOf(message.content);
	const text = contentText(message.content);
	const asks: AskShown[] = [];
	for (const call of calls) asks.push(await askWithAnswer(journal, call));
	return {
		kind: kindName(calls.length > 0 ? "askQuestion" : "assistant"),
		text: text || calls.length === 0 ? text : undefined,
		asks,
	};
}

async function describe(
	entry: JsonObject | undefined,
	journal: Journal,
	state: { asks: AskCalls; before?: Earlier },
): Promise<Described> {
	const message = messageOf(entry);
	if (message?.role === "user")
		return { kind: kindName("user"), text: contentText(message.content), user: relation(state.before) };
	if (isAskAnswer(message)) {
		const call = state.asks.get(message.toolCallId);
		const asked = call === undefined ? undefined : entryHeader(call.line, kindName("askQuestion"), call.timestamp);
		return { kind: kindName("askAnswer"), answer: { asked, ask: answerAsk(message, state.asks) } };
	}
	if (message?.role === "assistant") return assistantLines(message, journal);
	return { kind: otherKind(entry, message), text: message ? contentText(message.content) : "" };
}

/** The line with what it relates to, then the call to page around it. */
export async function citeLine(journal: Journal, params: ReadParams & { line: number }): Promise<string> {
	const asks = new AskCalls();
	let before: Earlier | undefined;
	for (let raw = await journal.next(); raw !== undefined; raw = await journal.next()) {
		if (journal.count < params.line) {
			before = remember(raw, journal.count, asks) ?? before;
			continue;
		}
		const entry = parseLine(raw);
		// Read before describe, which reads on to an ask's answer.
		const line = journal.count;
		const described = await describe(entry, journal, { asks, before });
		return templates.line.render({
			// line.md asks for each part; a line has only some of them.
			text: undefined,
			user: undefined,
			answer: undefined,
			asks: undefined,
			...described,
			file: journal.file,
			header: entryHeader(line, described.kind, textOf(entry?.timestamp)),
			shown: described.text !== undefined,
			lookahead: LOOKAHEAD,
			around: nextCall(params, { line: params.line, before: 5, after: 5 }),
		});
	}
	throw journal.pastEnd();
}
