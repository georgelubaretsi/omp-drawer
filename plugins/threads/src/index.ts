// The threads plugin: puts the project's open threads (the `*.md` files in the folder its
// `.omp/threads.json` names) in front of the main agent, as a message shown in the chat before a
// prompt whenever the list changed since the last one in the branch, and at the first prompt after
// a compaction. When the last open thread closes, a "no open threads" line replaces the list; when
// no `.omp/threads.json` names a folder any more (removed, or the session moved), a "no threads
// folder" line does. Subagents get nothing. Reads files and git only. Its rule points the agent to
// the threads skill.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { findThreadsFolder } from "./folder";
import { renderThreads } from "./list";
import { templates } from "./templates";

/** The `customType` of the message; omp shows it in the chat as the card's heading. */
export const THREADS_TYPE = "threads.list";

/** The fields of a session entry the hook looks at. */
export interface BranchEntry {
	type: string;
	customType?: string;
	content?: unknown;
}

/** What the hook needs from omp's extension context. */
export interface ThreadsContext {
	agent: { kind: "main" | "sub" };
	cwd: string;
	sessionManager: { getBranch(): readonly BranchEntry[] };
}

/** The content of the last threads message in the branch since its last compaction. */
function lastSent(branch: readonly BranchEntry[]): unknown {
	let last: unknown;
	for (const entry of branch) {
		if (entry.type === "compaction") last = undefined;
		else if (entry.type === "custom_message" && entry.customType === THREADS_TYPE) last = entry.content;
	}
	return last;
}

/**
 * The list to send before a prompt, or undefined when there is nothing new. The branch is read on
 * every attempt, because omp may discard a returned message (retry, abort) and ask again.
 */
export function threadsMessage(ctx: ThreadsContext): string | undefined {
	if (ctx.agent.kind === "sub") return undefined;
	const folder = findThreadsFolder(ctx.cwd);
	const last = lastSent(ctx.sessionManager.getBranch());
	if (folder === undefined) {
		// A list sent earlier must not stay the latest word once nothing names its folder.
		const gone = templates.noFolder.render();
		return last === undefined || last === gone ? undefined : gone;
	}
	// A list sent earlier must not stay the latest word once every thread is closed or dormant.
	// Every threads message is a list or a line saying there is none, so any earlier one may need it.
	const none = last === undefined ? "" : templates.none.render({ folder: folder.name });
	const text = renderThreads(folder) || none;
	return text === "" || text === last ? undefined : text;
}

export default function threads(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (_event, ctx) => {
		try {
			const content = threadsMessage(ctx);
			return content === undefined ? undefined : { message: { customType: THREADS_TYPE, content, display: true } };
		} catch (error) {
			pi.logger.warn("threads plugin failed", { error: String(error) });
			return undefined;
		}
	});
}
