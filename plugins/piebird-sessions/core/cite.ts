// One line and what it relates to: a user's message with the agent text it answered (or the
// user's words it follows), an ask answer with its whole ask, an ask question with its answer.
import { joinText, type ModelText } from "../kit/core/model";
import { askCallsOf, formatAsk } from "./ask";
import { contentText, type Item, type Journal, type Message, messageOf } from "./journal";
import { type JsonObject, textOf } from "./json";
import { model } from "./model.gen";
import { nextCall, type ReadParams } from "./params";
import { answerAsk, AskCalls, entryHeader, isAskAnswer, otherKind } from "./render";

/** What the answered agent text keeps: its end, where the question is. */
const ANSWERED_TAIL = 1500;
/** How far a question's line looks ahead for its answer (it is normally the next message). */
const LOOKAHEAD = 200;

interface Earlier {
	line: number;
	timestamp: string;
	kind: ModelText;
	/** The agent's text, which a user's message answers. */
	agent: boolean;
	text: string;
}

/** What the line shows below its header; `related`, what a user's message relates to, follows an empty line. */
interface Described {
	kind: ModelText;
	lines: ModelText[];
	related?: ModelText[];
}

// The latest message with text before the line, and the ask calls seen so far.
function remember(item: Item, asks: AskCalls): Earlier | undefined {
	asks.observe(item);
	const message = messageOf(item.entry);
	const at = { line: item.line, timestamp: textOf(item.entry?.timestamp) };
	if (message?.role === "assistant" || message?.role === "user") {
		const text = contentText(message.content);
		const agent = message.role === "assistant";
		return text ? { ...at, kind: model.text(agent ? "kind-assistant" : "kind-user"), agent, text } : undefined;
	}
	return isAskAnswer(message)
		? { ...at, kind: model.text("kind-ask-answer"), agent: false, text: answerAsk(message, asks).text }
		: undefined;
}

// What a user's message answers (the end of the agent's text) or follows (the user's own words).
function relation(before: Earlier | undefined): ModelText[] {
	if (before === undefined) return [model.text("cite-no-before")];
	const header = entryHeader(before.line, before.kind, before.timestamp).text;
	const cut = before.agent && before.text.length > ANSWERED_TAIL;
	return [
		model.text(before.agent ? "cite-answers" : "cite-follows", { header }),
		cut
			? model.text("cite-cut", { text: before.text.slice(-ANSWERED_TAIL) })
			: model.text("cite-text", { text: before.text }),
	];
}

// An ask call followed to its answer, a few lines on.
async function askWithAnswer(journal: Journal, call: { id: string; args: unknown }): Promise<ModelText[]> {
	const stop = journal.count + LOOKAHEAD;
	for (let item = await journal.next(); item !== undefined && item.line <= stop; item = await journal.next()) {
		if (!item.raw.includes(call.id)) continue;
		const message = messageOf(item.entry);
		if (!isAskAnswer(message) || message.toolCallId !== call.id) continue;
		const ask = formatAsk(call.args, { details: message.details, text: contentText(message.content) });
		return [ask, model.text("cite-answered", { line: item.line, timestamp: textOf(item.entry?.timestamp) })];
	}
	const ended = journal.count < stop;
	return [
		formatAsk(call.args),
		ended ? model.text("cite-ended") : model.text("cite-unanswered", { lookahead: LOOKAHEAD }),
	];
}

// An agent message: its text, and each ask it makes with the answer that followed.
async function assistantLines(message: Message, journal: Journal): Promise<Described> {
	const calls = askCallsOf(message.content);
	const text = contentText(message.content);
	const lines = text || calls.length === 0 ? [model.text("cite-text", { text })] : [];
	for (const call of calls) lines.push(...(await askWithAnswer(journal, call)));
	return { kind: model.text(calls.length > 0 ? "kind-ask-question" : "kind-assistant"), lines };
}

async function describe(
	entry: JsonObject | undefined,
	journal: Journal,
	state: { asks: AskCalls; before?: Earlier },
): Promise<Described> {
	const message = messageOf(entry);
	if (message?.role === "user") {
		const text = model.text("cite-text", { text: contentText(message.content) });
		return { kind: model.text("kind-user"), lines: [text], related: relation(state.before) };
	}
	if (isAskAnswer(message)) {
		const call = state.asks.get(message.toolCallId);
		const asked =
			call === undefined
				? model.text("cite-no-ask")
				: model.text("cite-asked", {
						header: entryHeader(call.line, model.text("kind-ask-question"), call.timestamp).text,
					});
		return { kind: model.text("kind-ask-answer"), lines: [asked, answerAsk(message, state.asks)] };
	}
	if (message?.role === "assistant") return assistantLines(message, journal);
	return {
		kind: otherKind(entry, message),
		lines: [model.text("cite-text", { text: message ? contentText(message.content) : "" })],
	};
}

/** The line with what it relates to, then the call to page around it. */
export async function citeLine(journal: Journal, params: ReadParams & { line: number }): Promise<ModelText> {
	const asks = new AskCalls();
	let before: Earlier | undefined;
	for (let item = await journal.next(); item !== undefined; item = await journal.next()) {
		if (item.line < params.line) {
			before = remember(item, asks) ?? before;
			continue;
		}
		const described = await describe(item.entry, journal, { asks, before });
		const head = joinText([
			model.text("cite-file", { file: journal.file }),
			entryHeader(item.line, described.kind, textOf(item.entry?.timestamp)),
			...described.lines,
		]);
		const around = model.text("cite-around", {
			call: nextCall(params, { line: params.line, before: 5, after: 5 }).text,
		});
		if (described.related === undefined) return joinText([head, around]);
		return joinText([head, joinText([...described.related, around])], "paragraph");
	}
	throw journal.pastEnd();
}
