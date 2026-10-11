// The agent's own session: omp doesn't tell the agent its session id, so a line names it
// (id, journal, the session it was forked from) for the agent to read or cite it with
// session_read. Only the main agent gets it, and only when it changed since the last one in the
// branch: a fork or a move to a new file changes it, and a compaction drops the last one.
import os from "node:os";
import path from "node:path";
import { templates } from "./templates";

/** The `customType` of the message; omp shows it in the chat as the card's heading. */
export const SELF_TYPE = "sessions.self";

/** The fields of a session entry the line looks at. */
export interface BranchEntry {
	type: string;
	customType?: string;
	content?: unknown;
}

/** What the line needs from omp's extension context. */
export interface SelfContext {
	agent: { kind: "main" | "sub" };
	sessionManager: {
		getSessionId(): string;
		getSessionFile(): string | undefined;
		getHeader(): { parentSession?: string } | null;
		getBranch(): readonly BranchEntry[];
	};
}

function selfLine(sessions: SelfContext["sessionManager"]): string | undefined {
	const file = sessions.getSessionFile();
	if (file === undefined) return undefined;
	const home = os.homedir();
	const shown = file === home || file.startsWith(`${home}${path.sep}`) ? `~${file.slice(home.length)}` : file;
	// Full ids: they are UUIDv7, so sessions started minutes apart (a fork and its parent too)
	// share a long prefix. parentSession is an id after a fork or move, or the source file's
	// path for a branched session; win32's basename splits on both `/` and `\`.
	const parent = sessions.getHeader()?.parentSession;
	const parentId =
		parent !== undefined && /[\\/]/.test(parent) ? path.win32.basename(parent, ".jsonl").replace(/^.*_/, "") : parent;
	const id = sessions.getSessionId();
	return templates.self.render({ id, journal: shown, parent: parentId });
}

/**
 * The line to send before a prompt, or undefined when there is nothing new. The branch is read
 * on every attempt, because omp may discard a returned message (retry, abort) and ask again.
 */
export function selfMessage(ctx: SelfContext): string | undefined {
	if (ctx.agent.kind === "sub") return undefined;
	const text = selfLine(ctx.sessionManager);
	if (text === undefined) return undefined;
	let last: unknown;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "compaction") last = undefined;
		else if (entry.type === "custom_message" && entry.customType === SELF_TYPE) last = entry.content;
	}
	return text === last ? undefined : text;
}
