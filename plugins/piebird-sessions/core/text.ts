// Putting the catalog's texts together: items in one line, joined by the catalog's own words, and
// paths as the agent sees them.
import type { ModelText } from "../kit/core/model";
import { model } from "./model.gen";
type Joiner = "join-comma" | "join-dot" | "join-or" | "join-and";

/** Items in one line, each pair joined by `joiner`; undefined for none. */
export function joinItems(items: readonly (ModelText | string)[], joiner: Joiner): ModelText | undefined {
	const texts = items.map(item => (typeof item === "string" ? model.text("part-text", { text: item }) : item));
	const [first, ...rest] = texts;
	if (first === undefined) return undefined;
	return rest.reduce((a, b) => model.text(joiner, { a: a.text, b: b.text }), first);
}

/** A path under the home folder as `~/…`, as the agent sees journals named. */
export function shownPath(file: string, home: string): string {
	return file === home || file.startsWith(`${home}/`) || file.startsWith(`${home}\\`)
		? `~${file.slice(home.length)}`
		: file;
}

/** A failure the model is told about, by one of the read operation's declared errors. */
export class ReadError extends Error {
	constructor(
		readonly id: string,
		readonly said: ModelText,
	) {
		super(said.text);
	}
}
