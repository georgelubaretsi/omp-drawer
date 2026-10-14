// Everything a plugin sends a model comes from its Fluent catalog: only a Catalog can make
// ModelText. Strict where Fluent would print a placeholder, and pure, so it runs in a Claude Code
// mod too.
import { FluentBundle, FluentNumber, FluentResource } from "./vendor/fluent/index.js";

const MINT: unique symbol = Symbol("model text");

/**
 * Text for the model. Its brand keeps any other object with a `text` from passing as one, while
 * every plugin's copy of the kit, and the tools that read them all, agree on the type; the build
 * refuses the brand written anywhere but here (tools/build/purity.ts).
 */
export class ModelText {
	readonly text: string;
	readonly brand = "piebird-catalog";
	constructor(mint: typeof MINT, text: string) {
		if (mint !== MINT) throw new Error("ModelText comes from a Catalog");
		this.text = text;
	}
	toString(): string {
		return this.text;
	}
}

/**
 * Texts from the catalog one after another, each on its own line, or with an empty line between
 * them as paragraphs. Line breaks are the one thing code adds: words come from the catalog.
 */
export function joinText(parts: readonly ModelText[], between: "line" | "paragraph" = "line"): ModelText {
	return new ModelText(MINT, parts.map(p => p.text).join(between === "line" ? "\n" : "\n\n"));
}

/** The message ids formatted while a trace runs, for the "what the model sees" page. */
let traced: string[] | undefined;

/** Runs `run` and returns, with its value, the ids of the messages it formatted, in order, each once. */
export async function traceMessages<T>(run: () => Promise<T>): Promise<{ value: T; ids: string[] }> {
	const outer = traced;
	traced = [];
	try {
		const value = await run();
		return { value, ids: [...new Set(traced)] };
	} finally {
		traced = outer;
	}
}

export type Variables = Readonly<Record<string, string | number>>;

/** Numbers as written, not grouped the locale's way: a line number reads as a call takes it. */
function plain(variables: Variables | undefined): Record<string, string | FluentNumber> | undefined {
	if (variables === undefined) return undefined;
	return Object.fromEntries(
		Object.entries(variables).map(([k, v]) => [
			k,
			typeof v === "number" ? new FluentNumber(v, { useGrouping: false }) : v,
		]),
	);
}

type Args<M, K extends keyof M> = M[K] extends undefined ? [] : [variables: M[K]];

/** `M` maps each message id, and `id.attribute`, to its variables, or `undefined` when it takes none. */
export class Catalog<M extends Record<string, Variables | undefined>> {
	readonly #bundle: FluentBundle;

	constructor(source: string) {
		// Bidi isolation marks around placeables would reach the model as text.
		this.#bundle = new FluentBundle("en-US", { useIsolating: false });
		// The parser skips an entry it can't read; the build refuses those (tools/build/model.ts).
		const errors = this.#bundle.addResource(new FluentResource(source));
		if (errors.length > 0) throw new Error(`the catalog: ${errors.map(e => e.message).join("; ")}`);
	}

	text<K extends keyof M & string>(id: K, ...args: Args<M, K>): ModelText {
		return this.#format(id, args[0]);
	}

	/**
	 * The message `id` chosen at run time, such as a vault's declared error. It throws, as `text`
	 * does, when the catalog lacks the message or `variables` lacks one it needs.
	 */
	textById(id: string, variables?: Variables): ModelText {
		return this.#format(id, variables);
	}

	#format(id: string, variables: Variables | undefined): ModelText {
		const [name, attribute] = id.split(".", 2);
		const message = this.#bundle.getMessage(name);
		if (!message) throw new Error(`no message ${name} in the catalog`);
		const pattern = attribute === undefined ? message.value : message.attributes[attribute];
		if (!pattern) throw new Error(`message ${id} has no ${attribute === undefined ? "value" : "such attribute"}`);
		const errors: Error[] = [];
		const text = this.#bundle.formatPattern(pattern, plain(variables), errors);
		if (errors.length > 0) throw new Error(`message ${id}: ${errors.map(e => e.message).join("; ")}`);
		traced?.push(id);
		return new ModelText(MINT, text);
	}
}
