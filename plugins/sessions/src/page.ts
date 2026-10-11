// The entries before and after a line (or from the start, with no line), as many as asked,
// counting only entries the flags render, so a long tool loop doesn't eat a page; the line
// itself is always shown, whatever it holds. templates/page.md lays the page out.
import type { Journal } from "./journal";
import { flagsOf, nextCall, type ReadParams } from "./read";
import { AskCalls, type Flags, formatEntry, type Rendered, renderEntry } from "./render";
import { templates } from "./templates";

/** A readable page stops at the entry boundary before this many characters; raw pages aren't capped. */
export const PAGE_CAP = 20000;

interface Collected {
	before: Rendered[];
	target?: Rendered;
	after: Rendered[];
	/** False when the page stopped before the end of the session. */
	reachedEnd: boolean;
}

// Keeps the last `want` rendered entries before the line.
function keepBefore(found: Collected, entry: Rendered | undefined, want: number): void {
	if (entry !== undefined) found.before.push(entry);
	if (found.before.length > want) found.before.shift();
}

// Whether an entry the flags render follows; reads on until one does or the journal ends.
async function renderableAhead(journal: Journal, flags: Flags, asks: AskCalls): Promise<boolean> {
	for (let raw = await journal.next(); raw !== undefined; raw = await journal.next()) {
		asks.observe(raw, journal.count);
		if (renderEntry({ raw, line: journal.count, force: false }, flags, asks) !== undefined) return true;
	}
	return false;
}

async function collect(journal: Journal, params: ReadParams, flags: Flags): Promise<Collected> {
	const asks = new AskCalls();
	const [wantBefore, wantAfter] = [params.before ?? 0, params.after ?? 0];
	const target = params.line ?? 0;
	const found: Collected = { before: [], after: [], reachedEnd: true };
	for (let raw = await journal.next(); raw !== undefined; raw = await journal.next()) {
		const line = journal.count;
		asks.observe(raw, line);
		if (line < target) {
			if (wantBefore > 0) keepBefore(found, renderEntry({ raw, line, force: false }, flags, asks), wantBefore);
			continue;
		}
		const entry = renderEntry({ raw, line, force: line === target }, flags, asks);
		if (line === target) found.target = entry;
		else if (entry !== undefined) found.after.push(entry);
		if (found.after.length >= wantAfter) {
			found.reachedEnd = !(await renderableAhead(journal, flags, asks));
			break;
		}
	}
	if (params.line !== undefined && found.target === undefined) throw journal.pastEnd();
	return found;
}

// Grows the page outward from the line, one entry a side at a time, until the cap.
function pageRange(blocks: string[], pivot: number): { low: number; high: number } {
	let [low, high] = [pivot, pivot];
	let size = blocks[pivot].length;
	const fits = (index: number) => index >= 0 && index < blocks.length && size + 2 + blocks[index].length <= PAGE_CAP;
	let [earlier, later] = [true, true];
	while (earlier || later) {
		earlier &&= fits(low - 1);
		if (earlier) size += 2 + blocks[--low].length;
		later &&= fits(high + 1);
		if (later) size += 2 + blocks[++high].length;
	}
	return { low, high };
}

/** A page as printed: its entries, the range of them shown, and how far the journal was read. */
interface Page {
	entries: Rendered[];
	low: number;
	high: number;
	found: Collected;
	/** Lines read; the session's length when the page reached its end. */
	read: number;
}

/** Entries left out of the page, by their lines. */
interface Span {
	count: number;
	first: number;
	last: number;
}

function span(entries: Rendered[], from: number, to: number): Span {
	return { count: to - from + 1, first: entries[from].line, last: entries[to].line };
}

function leftOut({ entries, low, high }: Page): { cap: number; earlier?: Span; later?: Span } | undefined {
	const end = entries.length - 1;
	if (low === 0 && high === end) return undefined;
	return {
		cap: PAGE_CAP,
		earlier: low > 0 ? span(entries, 0, low - 1) : undefined,
		later: high < end ? span(entries, high + 1, end) : undefined,
	};
}

// The call for the entries before the page; undefined at the start of the session.
function earlierCall(page: Page, params: ReadParams): string | undefined {
	const first = page.entries[page.low].line;
	const [wantBefore, wantAfter] = [params.before ?? 0, params.after ?? 0];
	const fullBefore = wantBefore === 0 ? first > 1 : page.found.before.length === wantBefore;
	const more = page.low > 0 || (params.line !== undefined && fullBefore);
	return more ? nextCall(params, { line: first, before: wantBefore || wantAfter || 5 }) : undefined;
}

// The call for the entries after the page; undefined at the end of the session.
function laterCall(page: Page, params: ReadParams): string | undefined {
	const more = page.high < page.entries.length - 1 || !page.found.reachedEnd;
	const after = params.after ?? params.before ?? 5;
	return more ? nextCall(params, { line: page.entries[page.high].line, after }) : undefined;
}

export async function pageEntries(journal: Journal, params: ReadParams): Promise<string> {
	const found = await collect(journal, params, flagsOf(params));
	const entries = [...found.before, ...(found.target ? [found.target] : []), ...found.after];
	if (entries.length === 0) return templates.page.render({ entries: [], length: journal.count });
	const raw = params.raw === true;
	const blocks = entries.map(entry => (raw ? entry.raw : formatEntry(entry)));
	const { low, high } = raw ? { low: 0, high: entries.length - 1 } : pageRange(blocks, found.before.length);
	const page: Page = { entries, low, high, found, read: journal.count };
	return templates.page.render({
		entries: blocks.slice(low, high + 1),
		raw,
		first: entries[low].line,
		last: entries[high].line,
		count: high - low + 1,
		leftOut: leftOut(page),
		earlierCall: earlierCall(page, params),
		laterCall: laterCall(page, params),
		length: page.read,
	});
}
