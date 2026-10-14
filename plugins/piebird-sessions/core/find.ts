// A case-insensitive search over what the flags render, from the start or from a line.
import { joinText, type ModelText } from "../kit/core/model";
import type { Journal } from "./journal";
import { model } from "./model.gen";
import { flagsOf, nextCall, type ReadParams } from "./params";
import { AskCalls, entryHeader, type Rendered, renderItem } from "./render";
import { joinItems } from "./text";

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
	for (let item = await journal.next(); item !== undefined; item = await journal.next()) {
		asks.observe(item);
		if (item.line < from) continue;
		const entry = renderItem(item, { ...flags, force: false }, asks);
		if (entry === undefined) continue;
		const text = entry.parts.map(part => part.text.text).join("\n");
		const at = text.toLowerCase().indexOf(needle);
		if (at < 0) continue;
		total++;
		if (matches.length < FIND_LIMIT) matches.push({ entry, text, at });
	}
	if (params.line !== undefined && journal.count < params.line) throw journal.pastEnd();
	return { matches, total };
}

// The match with some context on each side, its whitespace folded.
function snippet({ text, at }: Match, length: number): ModelText {
	const start = Math.max(0, at - SNIPPET_CONTEXT);
	const end = Math.min(text.length, at + length + SNIPPET_CONTEXT);
	return model.text("find-snippet", {
		start: start > 0 ? "cut" : "whole",
		snippet: text.slice(start, end).replace(/\s+/g, " "),
		end: end < text.length ? "cut" : "whole",
	});
}

function summary(params: ReadParams, total: number, shown: number, more: boolean): ModelText {
	let line = model.text("find-count", { total });
	if (params.line !== undefined) line = model.text("find-from", { count: line.text, from: params.line });
	return more ? model.text("find-shown", { count: line.text, shown }) : line;
}

export async function findEntries(journal: Journal, params: ReadParams): Promise<ModelText> {
	const needle = (params.find ?? "").toLowerCase();
	const { matches, total } = await scan(journal, params, needle);
	const [first, last] = [matches.at(0), matches.at(-1)];
	const more = total > matches.length && last !== undefined;
	const shown =
		params.raw === true
			? matches.map(m => model.text("raw-line", { raw: m.entry.raw }))
			: matches.map(m =>
					joinText([entryHeader(m.entry.line, m.entry.kind, m.entry.timestamp), snippet(m, needle.length)]),
				);
	const calls = [
		...(more
			? [model.text("find-more", { call: nextCall(params, { line: last.entry.line + 1, find: params.find }).text })]
			: []),
		...(first === undefined
			? []
			: [
					model.text("find-read", {
						call: nextCall({ ...params, find: undefined }, { line: first.entry.line, before: 3, after: 3 }).text,
					}),
				]),
	];
	const next = first === undefined ? undefined : joinItems(calls, "join-dot");
	const body = shown.length > 0 ? [joinText(shown, params.raw === true ? "line" : "paragraph")] : [];
	return joinText([...body, summary(params, total, matches.length, more), ...(next ? [next] : [])]);
}
