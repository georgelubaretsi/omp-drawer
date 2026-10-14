// The read operation: a line with what it relates to (line alone), a page around a line (before,
// after, or any flag), a search (find), or without a session this project's sessions.
import type { Io } from "../kit/core/io";
import type { ModelText } from "../kit/core/model";
import type { Handler } from "../kit/core/operations";
import { citeLine } from "./cite";
import { findEntries } from "./find";
import { Journal } from "./journal";
import { type ListSource, listSessions } from "./list";
import { openerOf, resolveSession } from "./lookup";
import { model } from "./model.gen";
import { PAGE, pageEntries } from "./page";
import { flagsOf, type ReadParams, readParams } from "./params";
import { ReadError } from "./text";

export interface ReadContext {
	/** Folders searched for a session id: every agent's journals, and this session's folder. */
	roots: readonly string[];
	/** Where this project's sessions are, for a call without a session. */
	list: ListSource;
	home: string;
}

function check(params: ReadParams): void {
	if (params.user === true && (params.thinking === true || params.tools === true))
		throw new ReadError("user-with-details", model.text("error-user-with-details"));
	if (params.find !== undefined && (params.before !== undefined || params.after !== undefined))
		throw new ReadError("find-with-page", model.text("error-find-with-page"));
	if (params.line === undefined && params.before !== undefined)
		throw new ReadError("before-without-line", model.text("error-before-without-line"));
}

/** A line alone, without before, after or a flag: the line with what it relates to. */
function citesLine(params: ReadParams): params is ReadParams & { line: number } {
	const plain = params.before === undefined && params.after === undefined;
	return params.line !== undefined && plain && !Object.values(flagsOf(params)).includes(true);
}

/** The operation's text for `params`. Only reads journals. */
export async function readSession(io: Io, params: ReadParams, context: ReadContext): Promise<ModelText> {
	if (params.session === undefined) {
		const { session: _, ...rest } = params;
		if (Object.values(rest).some(value => value !== undefined))
			throw new ReadError("list-with-params", model.text("error-list-with-params"));
		return listSessions(io, context.list, context.home);
	}
	check(params);
	const file = await resolveSession(io, params.session, context);
	const journal = new Journal(file, openerOf(io, file));
	try {
		if (params.find !== undefined) return await findEntries(journal, params);
		if (citesLine(params)) return await citeLine(journal, params);
		// Without a line, a page from the start.
		return await pageEntries(
			journal,
			params.line === undefined ? { ...params, after: params.after ?? PAGE } : params,
		);
	} finally {
		await journal.close();
	}
}

/** The read operation's handler, for the session `context` describes. */
export function readHandler(io: Io, context: ReadContext): Handler {
	return async input => {
		try {
			const params = readParams(input);
			const text = await readSession(io, params, context);
			return { ok: true, text, data: { session: params.session } };
		} catch (error) {
			if (error instanceof ReadError) return { ok: false, error: error.id, text: error.said };
			throw error;
		}
	};
}
