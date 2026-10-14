// piebird-threads in omp: the project's open threads in front of the main agent, as a message
// shown in the chat before a prompt whenever the list changed since the last one in the branch, and
// at the first prompt after a compaction (core/update.ts). Subagents get nothing. Its rule, which
// omp reads from rules/, points the agent to the threads skill.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { join } from "node:path";
import { PLUGIN } from "../core/folder";
import { threadsUpdate } from "../core/update";
import { bunIo } from "../kit/bun/io";
import { ompPlace } from "../kit/omp/io";
import { ompChoices } from "../kit/omp/settings";

/** The `customType` of the message; omp shows it in the chat as the card's heading. */
export const THREADS_TYPE = "threads.list";

/** The fields of a session entry the hook looks at. */
interface BranchEntry {
	readonly type: string;
	readonly customType?: string;
	readonly content?: unknown;
}

/** The content of the last threads message in the branch since its last compaction. */
export function lastSent(branch: readonly BranchEntry[]): unknown {
	let last: unknown;
	for (const entry of branch) {
		if (entry.type === "compaction") last = undefined;
		else if (entry.type === "custom_message" && entry.customType === THREADS_TYPE) last = entry.content;
	}
	return last;
}

export default function threads(pi: ExtensionAPI): void {
	const io = bunIo();
	const plugin = join(import.meta.dir, "..");
	// The branch is read on every attempt: omp may discard a returned message (retry, abort) and ask again.
	pi.on("before_agent_start", async (_event, ctx) => {
		if (ctx.agent.kind !== "main") return undefined;
		try {
			const place = ompPlace(ctx, plugin);
			const at = {
				choice: ompChoices(PLUGIN, ctx.cwd).folder,
				last: lastSent(ctx.sessionManager.getBranch()),
				now: Date.now() / 1000,
			};
			const text = await threadsUpdate(io, place, at);
			return text === undefined
				? undefined
				: { message: { customType: THREADS_TYPE, content: text.text, display: true } };
		} catch (error) {
			pi.logger.warn("threads plugin failed", { error: String(error) });
			return undefined;
		}
	});
}
