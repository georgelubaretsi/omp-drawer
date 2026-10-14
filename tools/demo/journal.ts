// What an agent did for a prompt, read from its session journals rather than the window (the
// window drops old turns as they scroll away): the turn after the prompt's user message, in
// whichever journal holds it (Tern agents and earlier sessions have their own). agents.ts reads
// each agent's lines.
import { join } from "node:path";
import { type Agent, type Event, readLine } from "./agents";

/** One tool call: the tool, the intent the agent gave it, and the error it got, if any. */
export interface Call {
	tool: string;
	intent: string;
	error?: string;
}

/** A finished turn: how it ended (`stop`, `error`, …) and its tool calls in order. */
export interface Turn {
	end: string;
	calls: Call[];
}

/** Where an agent's journals are: a folder and the pattern of journal paths under it. */
export interface Journals {
	dir: string;
	glob: string;
}

interface Open {
	asked: boolean;
	end?: string;
	calls: (Call & { id: string })[];
}

/** Adds what one line says to the turn it belongs to. */
function apply(turn: Open, event: Event): void {
	for (const call of event.calls ?? []) turn.calls.push(call);
	for (const error of event.errors ?? []) {
		const call = turn.calls.find(c => c.id === error.id);
		if (call) call.error = error.text;
	}
	if (event.end) turn.end = event.end;
}

/** Follows one journal: a new turn at each user message holding `prompt`, with its calls and end. */
function follow(agent: Agent, lines: string[], prompt: string): Turn | undefined {
	let turn: Open = { asked: false, calls: [] };
	for (const line of lines) {
		const event = readLine(agent, line);
		if (event.user?.includes(prompt)) turn = { asked: true, calls: [] };
		else if (turn.asked && !turn.end) apply(turn, event);
	}
	if (!turn.asked || !turn.end) return undefined;
	return { end: turn.end, calls: turn.calls.map(({ id: _, ...call }) => call) };
}

/** The finished turn answering `prompt` in `agent`'s journals; undefined while it runs. */
export async function turnFor(agent: Agent, journals: Journals, prompt: string): Promise<Turn | undefined> {
	const glob = new Bun.Glob(journals.glob);
	const paths = await Array.fromAsync(glob.scan({ cwd: journals.dir })).catch(() => []);
	for (const rel of paths) {
		const turn = follow(agent, (await Bun.file(join(journals.dir, rel)).text()).split("\n"), prompt);
		if (turn) return turn;
	}
	return undefined;
}
