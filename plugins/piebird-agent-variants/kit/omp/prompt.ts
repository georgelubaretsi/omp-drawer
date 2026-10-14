// Text a plugin adds to omp's system prompt before each agent run. The build copies kit/ into each
// plugin that needs it (plugins/<name>/kit/); edit it in kit/.
import type { ModelText } from "../core/model";
import type { OmpContext } from "./io";

/**
 * What addToSystemPrompt uses of omp's extension API (`ExtensionAPI` in `@oh-my-pi/pi-coding-agent`).
 * Declared here so kit/ needs no omp package to typecheck; each plugin passes its own `pi`, so the
 * plugin's typecheck checks omp's real type against this one.
 */
export interface PromptHost {
	on(
		event: "before_agent_start",
		handler: (
			event: { readonly systemPrompt: readonly string[] },
			ctx: OmpContext,
		) => Promise<{ systemPrompt: string[] } | undefined>,
	): void;
}

/** Appends `text(ctx)` to the system prompt before each agent run; undefined adds nothing. */
export function addToSystemPrompt(pi: PromptHost, text: (ctx: OmpContext) => Promise<ModelText | undefined>): void {
	pi.on("before_agent_start", async (event, ctx) => {
		const added = await text(ctx);
		return added === undefined ? undefined : { systemPrompt: [...event.systemPrompt, added.text] };
	});
}
