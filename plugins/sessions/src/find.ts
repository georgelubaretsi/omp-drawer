// A case-insensitive search over what the flags render, from the start or from a line.
// templates/find.md lays the matches out.
import type { Journal } from "./journal";
import { flagsOf, nextCall, type ReadParams } from "./read";
import { AskCalls, entryHeader, type Rendered, renderEntry } from "./render";
import { templates } from "./templates";

/** Matches shown at most; the rest are counted. */
const FIND_LIMIT = 50;
/** Characters of context on each side of a match. */
const SNIPPET_CONTEXT = 120;

interface Match {
	entry: Rendered;
	text: string;
	at: number;
}

async function scan(
	journal: Journal,
	params: ReadParams,
	needle: string,
): Promise<{ matches: Match[]; total: number }> {
	const flags = flagsOf(params);
	const asks = new AskCalls();
	const from = params.line ?? 1;
	const matches: Match[] = [];
	let total = 0;
	for (let raw = await journal.next(); raw !== undefined; raw = await journal.next()) {
		asks.observe(raw, journal.count);
		if (journal.count < from) continue;
		const entry = renderEntry({ raw, line: journal.count, force: false }, flags, asks);
		if (entry === undefined) continue;
		const text = entry.parts.map(part => part.text).join("\n");
		const at = text.toLowerCase().indexOf(needle);
		if (at < 0) continue;
		total++;
		if (matches.length < FIND_LIMIT) matches.push({ entry, text, at });
	}
	if (params.line !== undefined && journal.count < params.line) throw journal.pastEnd();
	return { matches, total };
}

// The match with some context on each side, its whitespace folded.
function snippet({ text, at }: Match, length: number): { snippet: string; cutStart: boolean; cutEnd: boolean } {
	const start = Math.max(0, at - SNIPPET_CONTEXT);
	const end = Math.min(text.length, at + length + SNIPPET_CONTEXT);
	return { snippet: text.slice(start, end).replace(/\s+/g, " "), cutStart: start > 0, cutEnd: end < text.length };
}

export async function findEntries(journal: Journal, params: ReadParams): Promise<string> {
	const needle = (params.find ?? "").toLowerCase();
	const { matches, total } = await scan(journal, params, needle);
	const [first, last] = [matches.at(0), matches.at(-1)];
	const more = total > matches.length && last !== undefined;
	return templates.find.render({
		raw: params.raw === true,
		matches: matches.map(match => ({
			raw: match.entry.raw,
			header: entryHeader(match.entry.line, match.entry.kind, match.entry.timestamp),
			...snippet(match, needle.length),
		})),
		total,
		shown: matches.length,
		from: params.line,
		moreCall: more ? nextCall(params, { line: last.entry.line + 1, find: params.find }) : undefined,
		readCall:
			first === undefined
				? undefined
				: nextCall({ ...params, find: undefined }, { line: first.entry.line, before: 3, after: 3 }),
	});
}
