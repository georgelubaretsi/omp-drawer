// What a plugin tells the model at the start of a conversation, in a Claude Code mod: a block its
// `prompt.context` hook adds to the context of the first user message, which Claude Code renders
// under `# <name>` and computes again after compaction or /clear. The build copies kit/ into each
// plugin that needs it (plugins/<name>/kit/); edit it in kit/.
import type { ModelText } from "../core/model";

/** One block of `prompt.context`; its name must be unique among the conversation's blocks. */
export interface ContextBlock {
	readonly name: string;
	readonly text: string;
}

/** The block `name` with the model's text, for the hook to add to `(await next(e)).blocks`. */
export function contextBlock(name: string, text: ModelText): ContextBlock {
	return { name, text: text.text };
}
