import { citeLine } from "./cite";
import { findEntries } from "./find";
import { Journal, resolveSession } from "./journal";
import { pageEntries } from "./page";
import type { Flags } from "./render";
import { templates } from "./templates";

/** The tool's name, which the next-step hints call. */
export const TOOL_NAME = "session_read";

/** The tool's parameters. */
export interface ReadParams {
	session: string;
	line?: number;
	before?: number;
	after?: number;
	find?: string;
	user?: boolean;
	thinking?: boolean;
	tools?: boolean;
	raw?: boolean;
}

export interface ReadContext {
	/** Folders searched for a session id: omp's sessions folder, and this session's. */
	roots: readonly string[];
	signal?: AbortSignal;
}

export function flagsOf(params: ReadParams): Flags {
	return {
		user: params.user === true,
		thinking: params.thinking === true,
		tools: params.tools === true,
		raw: params.raw === true,
	};
}

/** A call for the same session with the same flags: the reader's next step. */
export function nextCall(params: ReadParams, change: Pick<ReadParams, "line" | "before" | "after" | "find">): string {
	const flags = Object.entries(flagsOf(params)).filter(([, on]) => on);
	const call = { session: params.session, ...change, ...Object.fromEntries(flags) };
	return `${TOOL_NAME} ${JSON.stringify(call)}`;
}

function check(params: ReadParams): void {
	if (params.user === true && (params.thinking === true || params.tools === true))
		throw new Error(templates.errors.userWithDetails.render());
	if (params.find !== undefined && (params.before !== undefined || params.after !== undefined))
		throw new Error(templates.errors.findWithPage.render());
	if (
		params.find === undefined &&
		params.line === undefined &&
		(params.after === undefined || params.before !== undefined)
	)
		throw new Error(templates.errors.nothingToRead.render());
}

/** A line alone, without before, after or a flag: the line with what it relates to. */
function citesLine(params: ReadParams): params is ReadParams & { line: number } {
	return (
		params.line !== undefined &&
		params.before === undefined &&
		params.after === undefined &&
		!Object.values(flagsOf(params)).includes(true)
	);
}

/**
 * Reads one session: a line with what it answered (line alone), a page around a line (before,
 * after, or any flag), or a search (find); returns the tool's text. Only reads the journal.
 */
export async function readSession(params: ReadParams, context: ReadContext): Promise<string> {
	check(params);
	const journal = new Journal(resolveSession(params.session, context.roots), context.signal);
	try {
		if (params.find !== undefined) return await findEntries(journal, params);
		if (citesLine(params)) return await citeLine(journal, params);
		return await pageEntries(journal, params);
	} finally {
		journal.close();
	}
}
