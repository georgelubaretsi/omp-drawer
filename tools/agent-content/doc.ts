// Turns what a plugin sends an agent into values for the agent-content templates: quote blocks
// that show it character for character and line for line, with this machine's paths hidden.

/** A path in an output and the neutral path shown instead. */
export type Replacement = readonly [from: string, to: string];

/** One example for a template: the call that produced it, and its output as a quote block. */
export interface Example {
	call: string;
	output: string;
}

// One line of agent text, shown as written: Markdown characters escaped, leading spaces kept.
function escapeLine(line: string): string {
	const indent = /^ */.exec(line)?.[0].length ?? 0;
	const body = line
		.slice(indent)
		.replace(/[\\`*_[\]<>#|~]/g, "\\$&")
		.replace(/^([-+>]|\d+\.)/, "\\$1");
	return "\u00a0".repeat(indent) + body;
}

export class Doc {
	readonly #replacements: readonly Replacement[];

	/** `replacements` hide this machine's paths (temporary folders, the checkout) in every output. */
	constructor(replacements: readonly Replacement[]) {
		this.#replacements = replacements;
	}

	/**
	 * What the agent receives, as a tinted callout box (it wraps): every character as written, each
	 * line break kept. Markdown files too are shown as their source, which is what the agent gets;
	 * formatted, their front matter would break the callout.
	 */
	quote(text: string): string {
		const lines = this.sample(text).split("\n");
		const body = lines.map((line, index) => {
			if (line.trim() === "") return ">";
			const next = lines[index + 1];
			return `> ${escapeLine(line)}${next !== undefined && next.trim() !== "" ? "\\" : ""}`;
		});
		return ["> [!NOTE]", ...body].join("\n");
	}

	/** What the agent receives, for one table cell; text with a line break can't be one, and throws. */
	cell(text: string): string {
		const shown = this.sample(text);
		if (shown.includes("\n")) throw new Error(`a table cell can't hold more than one line: ${shown}`);
		return escapeLine(shown);
	}

	example(call: string, output: string): Example {
		return { call, output: this.quote(output) };
	}

	/** `text` with this machine's paths replaced. */
	sample(text: string): string {
		let shown = text;
		for (const [from, to] of this.#replacements) shown = shown.replaceAll(from, to);
		return shown;
	}

	/** What `run` returns, or the message it throws: a tool result or a tool error. */
	async result(run: () => unknown): Promise<string> {
		try {
			return String(await run());
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}
}
