// The agent's own session: no agent tells the model its session id, so a line names it (id,
// journal, the session it was forked from) for the agent to read or cite it with session_read.
import type { ModelText } from "../kit/core/model";
import { model } from "./model.gen";
import { shownPath } from "./text";

/** What a branch entry looks like to the check for an earlier line (omp's session entries). */
export interface BranchEntry {
	type: string;
	customType?: string;
	content?: unknown;
}

/** The `customType` of omp's message carrying the line; omp shows it as the card's heading. */
export const SELF_TYPE = "sessions.self";

/**
 * The line for a session. `parent` is an id after a fork or move, or the source journal's path for
 * a branched omp session (both `/` and `\` separate its folders).
 */
export function selfLine(at: { id: string; file: string; parent?: string }, home: string): ModelText {
	const journal = shownPath(at.file, home);
	const parent =
		at.parent !== undefined && /[\\/]/.test(at.parent)
			? at.parent
					.replace(/^.*[\\/]/, "")
					.replace(/\.jsonl$/, "")
					.replace(/^.*_/, "")
			: at.parent;
	return parent === undefined
		? model.text("self", { id: at.id, journal })
		: model.text("self-forked", { id: at.id, journal, parent });
}

/**
 * Whether the line is new in this branch: a fork or a move to a new file changes it, and a
 * compaction drops the last one. Read on every attempt, as omp may discard a message and ask again.
 */
export function isNewIn(text: ModelText, branch: readonly BranchEntry[]): boolean {
	let last: unknown;
	for (const entry of branch) {
		if (entry.type === "compaction") last = undefined;
		else if (entry.type === "custom_message" && entry.customType === SELF_TYPE) last = entry.content;
	}
	return text.text !== last;
}
