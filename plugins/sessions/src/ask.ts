// An ask, in full: the questions and options come from the agent's `ask` call, what was picked
// or typed from the answer entry's `details.results` (one per question: `id`, `question`,
// `options`, `selectedOptions`, `customInput`). Asks are bounded by the ask tool itself, so
// nothing here is cut.
import { asArray, asObject, asString, textOf } from "./json";
import { templates } from "./templates";

interface Question {
	id: string;
	question: string;
	options: Array<{ label: string; description?: string }>;
}

interface Result {
	question: Question;
	selected: string[];
	typed?: string;
}

/** What an answer entry carries: its per-question results and its plain text. */
export interface AskAnswer {
	details: unknown;
	text: string;
}

function questionsOf(args: unknown): Question[] {
	return asArray(asObject(args)?.questions).map(item => {
		const question = asObject(item);
		return {
			id: textOf(question?.id),
			question: textOf(question?.question),
			options: asArray(question?.options).map(option => {
				const fields = asObject(option);
				return { label: asString(fields?.label) ?? textOf(option), description: asString(fields?.description) };
			}),
		};
	});
}

/** The answer's results by question id; undefined when the entry has none (older omp). */
function resultsOf(details: unknown): Map<string, Result> | undefined {
	const raw = asObject(details)?.results;
	if (!Array.isArray(raw)) return undefined;
	const byId = new Map<string, Result>();
	for (const item of asArray(raw)) {
		const [question] = questionsOf({ questions: [item] });
		if (question === undefined) continue;
		const fields = asObject(item);
		const selected = asArray(fields?.selectedOptions).map(textOf);
		byId.set(question.id, { question, selected, typed: asString(fields?.customInput) });
	}
	return byId;
}

/** What was picked and what was typed for one question; empty when it got no answer. */
function answerOf(result: Result | undefined): Array<{ picked: string[] | undefined; typed: string | undefined }> {
	if (result === undefined) return [];
	return [
		...(result.selected.length > 0 ? [{ picked: result.selected, typed: undefined }] : []),
		...(result.typed !== undefined ? [{ picked: undefined, typed: result.typed }] : []),
	];
}

/**
 * Each question with its options; with an answer, what was picked or typed under each. The
 * questions come from the call, or from the answer's results when the call isn't known.
 */
export function formatAsk(args: unknown, answer?: AskAnswer): string {
	const results = answer === undefined ? undefined : resultsOf(answer.details);
	let questions = questionsOf(args);
	if (questions.length === 0 && results !== undefined)
		questions = [...results.values()].map(result => result.question);
	return templates.ask.render({
		questions: questions.map(question => ({
			...question,
			answered: results !== undefined,
			answer: answerOf(results?.get(question.id)),
		})),
		// An answer without per-question results is shown as it was written.
		text: results === undefined ? answer?.text : undefined,
	});
}

/** The `ask` tool calls in an assistant message's content. */
export function askCallsOf(content: unknown): Array<{ id: string; args: unknown }> {
	return asArray(content).flatMap(block => {
		const call = asObject(block);
		const id = asString(call?.id);
		return call?.type === "toolCall" && call.name === "ask" && id !== undefined ? [{ id, args: call.arguments }] : [];
	});
}
