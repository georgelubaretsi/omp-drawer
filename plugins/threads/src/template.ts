// A text this plugin shows, kept in a Markdown file and filled the way omp fills its prompts: with
// omp's own Handlebars, from @oh-my-pi/pi-utils, which omp provides to plugins. Not through
// prompt.render, whose tidying (blank lines, table padding) would change the text filled in.
import { parseFrontmatter, prompt } from "@oh-my-pi/pi-utils";

// The frontmatter's texts by dotted key ("kinds.user"); a value neither text nor a group throws.
function textsOf(group: object, prefix: string, texts: Map<string, string>): Map<string, string> {
	for (const key of Object.keys(group)) {
		const value: unknown = Reflect.get(group, key);
		const name = `${prefix}${key}`;
		if (typeof value === "string") texts.set(name, value);
		else if (typeof value === "object" && value !== null && !Array.isArray(value)) textsOf(value, `${name}.`, texts);
		else throw new Error(`template text "${name}" is neither text nor a group of texts`);
	}
	return texts;
}

// The values a template is filled with, as a view that throws on a name they lack: Handlebars
// prints a misspelled name as nothing. A value that may be absent is passed as undefined.
// Handlebars asks whether a name is the value's own before reading it, so both are trapped.
function strict<T extends object>(values: T, path: string): T {
	const missing = (key: string) => new Error(`template uses ${path}${key}, which has no value`);
	return new Proxy(values, {
		getOwnPropertyDescriptor(target, key) {
			if (typeof key === "string" && !Object.hasOwn(target, key)) throw missing(key);
			return Reflect.getOwnPropertyDescriptor(target, key);
		},
		get(target, key, receiver) {
			const value: unknown = Reflect.get(target, key, receiver);
			if (typeof key !== "string") return value;
			if (!(key in target)) throw missing(key);
			return typeof value === "object" && value !== null ? strict(value, `${path}${key}.`) : value;
		},
	});
}

// A value named like one of omp's Handlebars helpers (`default`, `join`, ...) would call the
// helper instead of printing the value, so a template using one is refused when it loads.
function checkNames(template: string): void {
	for (const [, name] of template.matchAll(/\{\{\s*([A-Za-z_]\w*)(?:\.[\w.]+)?\s*\}\}/g)) {
		if (name === "this" || name === "else") continue;
		if (prompt.compile(`{{${name}}}`)({ [name]: name }) !== name)
			throw new Error(`template value {{${name}}} has a Handlebars helper's name: rename it`);
	}
}

/**
 * A template file: its body lays out one output, and its frontmatter holds the short texts the
 * output is made of, each a template too.
 */
export class Template {
	readonly #body: string;
	readonly #texts: Map<string, string>;

	/**
	 * `source` is the file's text. Malformed frontmatter, a value that isn't text, or a value named
	 * like a Handlebars helper throws.
	 */
	constructor(source: string) {
		const { frontmatter, body } = parseFrontmatter(source, { level: "fatal", repair: false, rawKeys: true });
		// parseFrontmatter trims the body only in a file with frontmatter.
		this.#body = body.trim();
		this.#texts = textsOf(frontmatter, "", new Map());
		for (const template of [this.#body, ...this.#texts.values()]) checkNames(template);
	}

	/**
	 * The body filled; the newline a closing block tag leaves at the end is dropped. A name the
	 * body uses that `values` lacks throws.
	 */
	render(values: Record<string, unknown> = {}): string {
		return prompt.compile(this.#body)(strict(values, "")).replace(/\n$/, "");
	}

	/** A frontmatter text by its dotted key, filled. A key the file lacks, or a name `values` lacks, throws. */
	text(key: string, values: Record<string, unknown> = {}): string {
		const found = this.#texts.get(key);
		if (found === undefined) throw new Error(`template has no text "${key}"`);
		return prompt.compile(found)(strict(values, ""));
	}
}
