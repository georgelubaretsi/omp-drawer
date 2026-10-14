// The entries before and after a line (or from the start, with no line), as many as asked,
// counting only entries the flags render, so a long tool loop doesn't eat a page; the line
// itself is always shown, whatever it holds.
import { joinText, type ModelText } from "../kit/core/model";
import type { Item, Journal } from "./journal";
import { model } from "./model.gen";
import { flagsOf, nextCall, type ReadParams } from "./params";
import { AskCalls, type Flags, formatEntry, type Rendered, renderItem } from "./render";
import { joinItems } from "./text";

/** A readable page stops at the entry boundary before this many characters; raw pages aren't capped. */
export const PAGE_CAP = 20000;
/** Messages in a page when the call names no count. */
export const PAGE = 5;

interface Collected {
	before: Rendered[];
	target?: Rendered;
	after: Rendered[];
	/** False when the page stopped before the end of the session. */
	reachedEnd: boolean;
}

// Whether an entry the flags render follows; reads on until one does or the journal ends.
async function renderableAhead(journal: Journal, flags: Flags, asks: AskCalls): Promise<boolean> {
	for (let item = await journal.next(); item !== undefined; item = await journal.next()) {
		asks.observe(item);
		if (renderItem(item, { ...flags, force: false }, asks) !== undefined) return true;
	}
	return false;
}

interface Wanted {
	before: number;
	after: number;
	/** The line the page is around; 0 for a page from the start. */
	target: number;
}

type Render = (item: Item, force: boolean) => Rendered | undefined;

/** Keeps the last `want.before` entries before the line. */
function noteBefore(found: Collected, item: Item, want: Wanted, render: Render): void {
	const entry = want.before > 0 ? render(item, false) : undefined;
	if (entry !== undefined) found.before.push(entry);
	if (found.before.length > want.before) found.before.shift();
}

/** Takes the line itself, shown whatever it holds, then the entries after it; true once it has enough. */
function noteFrom(found: Collected, item: Item, want: Wanted, render: Render): boolean {
	const isTarget = item.line === want.target && found.target === undefined;
	const entry = render(item, isTarget);
	if (isTarget) found.target = entry;
	else if (entry !== undefined) found.after.push(entry);
	return found.after.length >= want.after;
}

async function collect(journal: Journal, params: ReadParams, flags: Flags): Promise<Collected> {
	const asks = new AskCalls();
	const want: Wanted = { before: params.before ?? 0, after: params.after ?? 0, target: params.line ?? 0 };
	const render: Render = (item, force) => renderItem(item, { ...flags, force }, asks);
	const found: Collected = { before: [], after: [], reachedEnd: true };
	for (let item = await journal.next(); item !== undefined; item = await journal.next()) {
		asks.observe(item);
		if (item.line < want.target) noteBefore(found, item, want, render);
		else if (noteFrom(found, item, want, render)) {
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
}

function leftOut({ entries, low, high }: Page): ModelText | undefined {
	const end = entries.length - 1;
	if (low === 0 && high === end) return undefined;
	const span = (from: number, to: number) => ({
		count: to - from + 1,
		first: entries[from].line,
		last: entries[to].line,
	});
	const spans = [
		...(low > 0 ? [model.text("page-span-earlier", span(0, low - 1))] : []),
		...(high < end ? [model.text("page-span-later", span(high + 1, end))] : []),
	];
	return model.text("page-left-out", { cap: PAGE_CAP, spans: joinItems(spans, "join-and")?.text ?? "" });
}

// The call for the entries before the page; undefined at the start of the session.
function earlierCall(page: Page, params: ReadParams): ModelText | undefined {
	const first = page.entries[page.low].line;
	const [wantBefore, wantAfter] = [params.before ?? 0, params.after ?? 0];
	const fullBefore = wantBefore === 0 ? first > 1 : page.found.before.length === wantBefore;
	const more = page.low > 0 || (params.line !== undefined && fullBefore);
	return more ? nextCall(params, { line: first, before: wantBefore || wantAfter || PAGE }) : undefined;
}

// The call for the entries after the page; undefined at the end of the session.
function laterCall(page: Page, params: ReadParams): ModelText | undefined {
	const more = page.high < page.entries.length - 1 || !page.found.reachedEnd;
	const after = params.after ?? params.before ?? PAGE;
	return more ? nextCall(params, { line: page.entries[page.high].line, after }) : undefined;
}

function navigation(page: Page, params: ReadParams, length: number): ModelText {
	const earlier = earlierCall(page, params);
	const later = laterCall(page, params);
	return model.text("join-dot", {
		a: (earlier ? model.text("page-earlier", { call: earlier.text }) : model.text("page-earlier-start")).text,
		b: (later ? model.text("page-later", { call: later.text }) : model.text("page-later-end", { length })).text,
	});
}

export async function pageEntries(journal: Journal, params: ReadParams): Promise<ModelText> {
	const found = await collect(journal, params, flagsOf(params));
	const entries = [...found.before, ...(found.target ? [found.target] : []), ...found.after];
	if (entries.length === 0) return model.text("page-empty", { length: journal.count });
	const raw = params.raw === true;
	const blocks = entries.map(entry => (raw ? model.text("raw-line", { raw: entry.raw }) : formatEntry(entry)));
	const sizes = blocks.map(b => b.text);
	const { low, high } = raw ? { low: 0, high: entries.length - 1 } : pageRange(sizes, found.before.length);
	const page: Page = { entries, low, high, found };
	const shown = joinText(blocks.slice(low, high + 1), raw ? "line" : "paragraph");
	const range = model.text("page-lines", {
		first: entries[low].line,
		last: entries[high].line,
		count: high - low + 1,
	});
	const cap = leftOut(page);
	return joinText([shown, range, ...(cap ? [cap] : []), navigation(page, params, journal.count)]);
}
