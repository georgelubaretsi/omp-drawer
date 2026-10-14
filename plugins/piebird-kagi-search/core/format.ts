// Each operation's output as the model reads it: Markdown lists of linked titles with their details,
// stories with their sources, Kagi's answer, a raw response. Words come from model.ftl; this only
// picks the pieces and puts them on lines.
import type { ModelText } from "../kit/core/model";
import type { Fields } from "./data";
import { joinText } from "../kit/core/model";
import { fieldsOf, itemsAt, numberAt, textAt, textsAt } from "./data";
import { errorText, sourceText } from "./errors";
import { model } from "./model.gen";

/** Kagi's limit on a raw body, in MB (internal/kagi's MaxRaw). */
const RAW_LIMIT_MB = 4;

/** Kagi's citation markers in a story's summary ([agi.it#1]): they name a source, not what it says. */
const CITATION = /\s*\[[^\]\s]+#\d+\]/g;

interface Row {
	readonly title: string;
	readonly url: string;
	readonly details: readonly string[];
	readonly snippet?: string;
}

/** A title as link text: its brackets escaped, so it can't close the link. */
function linkText(title: string): string {
	return title.replaceAll("[", "\\[").replaceAll("]", "\\]");
}

/** `line` with each detail after it; a blank one, or Kagi's placeholder for no author, is left out. */
function withDetails(line: ModelText, details: readonly string[]): ModelText {
	return details
		.filter(d => d !== "" && d !== "Unknown author")
		.reduce((l, detail) => model.text("with-detail", { line: l.text, detail }), line);
}

/** Items in one line, joined the catalog's way; empty for none. */
export function commaList(items: readonly string[]): string {
	return items.length === 0 ? "" : items.reduce((a, b) => model.text("join-comma", { a, b }).text);
}

function numbered(rows: readonly Row[], none: ModelText): ModelText {
	if (rows.length === 0) return none;
	return joinText(
		rows.flatMap((r, i) => {
			const line = withDetails(model.text("result", { n: i + 1, title: linkText(r.title), url: r.url }), r.details);
			return r.snippet ? [line, model.text("result-snippet", { snippet: r.snippet })] : [line];
		}),
	);
}

function webResults(output: Fields): ModelText {
	const rows = itemsAt(output, "results").map(r => ({
		title: textAt(r, "title"),
		url: textAt(r, "url"),
		details: [textAt(r, "date")],
		snippet: textAt(r, "snippet"),
	}));
	return numbered(rows, model.text("results-none"));
}

function newsResults(output: Fields): ModelText {
	const rows = itemsAt(output, "results").map(r => ({
		title: textAt(r, "title"),
		url: textAt(r, "url"),
		details: [textAt(r, "source"), textAt(r, "age")],
		snippet: textAt(r, "snippet"),
	}));
	return numbered(rows, model.text("results-none"));
}

function posts(output: Fields): ModelText {
	const rows = itemsAt(output, "posts").map(p => ({
		title: textAt(p, "title"),
		url: textAt(p, "url"),
		details: [textAt(p, "author"), textAt(p, "published")],
	}));
	return numbered(rows, model.text("posts-none"));
}

function batches(output: Fields): ModelText {
	const each = itemsAt(output, "batches").map(b =>
		joinText([model.text("batch-query", { query: textAt(b, "query") }), webResults(b)], "paragraph"),
	);
	return joinText(each, "paragraph");
}

function answer(output: Fields): ModelText {
	const references = textAt(output, "references");
	const text = model.text("answer", { answer: textAt(output, "answer") });
	return references === "" ? text : joinText([text, model.text("answer-references", { references })], "paragraph");
}

/** A story: its heading, its summary without citation markers, and up to three of its sources. */
function story(s: Fields): ModelText {
	const heading = `${textAt(s, "emoji")} ${textAt(s, "title")}`.trim();
	const summary = textAt(s, "short_summary").replace(CITATION, "").trim();
	const sources = itemsAt(s, "articles")
		.slice(0, 3)
		.map(a => model.text("story-source", { name: linkText(textAt(a, "domain")), url: textAt(a, "link") }).text);
	return joinText([
		model.text("story-heading", { heading }),
		...(summary === "" ? [] : [model.text("story-summary", { summary })]),
		...(sources.length === 0 ? [] : [model.text("story-sources", { sources: commaList(sources) })]),
	]);
}

function stories(output: Fields): ModelText {
	const list = itemsAt(output, "stories");
	return list.length === 0 ? model.text("stories-none") : joinText(list.map(story), "paragraph");
}

function categories(output: Fields): ModelText {
	return joinText(
		itemsAt(output, "categories").map(c =>
			model.text("category", {
				id: textAt(c, "categoryId"),
				name: textAt(c, "categoryName"),
				stories: numberAt(c, "clusterCount"),
			}),
		),
	);
}

function chaos(output: Fields): ModelText {
	const index = model.text("chaos", {
		index: numberAt(output, "chaosIndex"),
		updated: textAt(output, "chaosLastUpdated"),
	});
	const description = textAt(output, "chaosDescription");
	return description === "" ? index : joinText([index, model.text("chaos-description", { description })], "paragraph");
}

function presets(output: Fields): ModelText {
	return joinText(
		itemsAt(output, "presets").map(p =>
			model.text("preset", {
				id: textAt(p, "id"),
				label: textAt(p, "label"),
				keywords: commaList(textsAt(p, "keywords")),
			}),
		),
	);
}

function status(output: Fields): ModelText {
	const from = fieldsOf(output.from);
	if (output.signed_in === true) return model.text("status-signed-in", { from: sourceText(from).text });
	if (textAt(from, "kind") === "") return model.text("status-none");
	const problem = fieldsOf(output.problem);
	const why = errorText(textAt(problem, "id"), fieldsOf(problem.variables));
	return model.text("status-refused", { from: sourceText(from).text, problem: why.text });
}

/** A code fence longer than any run of backticks in `text`. */
function fenceFor(text: string): string {
	const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map(m => m[0].length));
	return "`".repeat(Math.max(3, longest + 1));
}

/** A body too long to send, saved to a file: where, and how it starts. */
function saved(file: Fields): ModelText[] {
	const kb = Math.ceil(numberAt(file, "bytes") / 1024);
	const where = model.text("response-saved", { kb, path: textAt(file, "path"), type: textAt(file, "type") });
	const preview = textAt(file, "preview");
	if (preview === "") return [where];
	return [where, model.text("response-preview"), model.text("fenced", { fence: fenceFor(preview), text: preview })];
}

function response(output: Fields): ModelText {
	let head = model.text("response-head", { status: numberAt(output, "status"), type: textAt(output, "content_type") });
	const location = textAt(output, "location");
	if (location !== "") head = model.text("response-location", { head: head.text, location });
	if (output.truncated === true) head = model.text("response-truncated", { head: head.text, mb: RAW_LIMIT_MB });
	const file = fieldsOf(output.saved);
	if (textAt(file, "path") !== "") return joinText([head, ...saved(file)], "paragraph");
	const body = typeof output.body === "string" ? output.body : "";
	return body === "" ? head : joinText([head, model.text("response-body", { body })], "paragraph");
}

/** How each operation's output reads, by operation id. */
export const formatters: Readonly<Record<string, (output: Fields) => ModelText>> = {
	search: webResults,
	"batch-search": batches,
	quick: answer,
	status,
	"news-search": newsResults,
	news: stories,
	"news-categories": categories,
	"news-chaos": chaos,
	"news-filter-presets": presets,
	smallweb: posts,
	"raw-read": response,
	"raw-write": response,
};
