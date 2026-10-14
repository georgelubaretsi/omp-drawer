// The read operation's arguments, checked, and the next calls an output suggests.
import type { ModelText } from "../kit/core/model";
import { asObject } from "./json";
import { model } from "./model.gen";
import type { Flags } from "./render";
import { ReadError } from "./text";

export interface ReadParams {
	/** Omitted: list this project's sessions. */
	session?: string;
	line?: number;
	before?: number;
	after?: number;
	find?: string;
	user?: boolean;
	thinking?: boolean;
	tools?: boolean;
	raw?: boolean;
}

const TEXTS: readonly ("session" | "find")[] = ["session", "find"];
const COUNTS: readonly ("line" | "before" | "after")[] = ["line", "before", "after"];
const FLAGS: readonly ("user" | "thinking" | "tools" | "raw")[] = ["user", "thinking", "tools", "raw"];

function bad(name: string, kind: "text" | "count" | "flag"): ReadError {
	return new ReadError("bad-argument", model.text("error-bad-argument", { name, kind }));
}

const isText = (value: unknown): value is string => typeof value === "string";
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;
const isFlag = (value: unknown): value is boolean => typeof value === "boolean";

/** The argument `name` when given; one of another kind throws. */
function checked<T>(
	fields: Readonly<Record<string, unknown>>,
	name: string,
	kind: "text" | "count" | "flag",
	ok: (value: unknown) => value is T,
): T | undefined {
	const value = fields[name];
	if (value === undefined) return undefined;
	if (!ok(value)) throw bad(name, kind);
	return value;
}

/** The arguments as the caller sent them, checked against what each takes. */
export function readParams(input: unknown): ReadParams {
	const fields = asObject(input) ?? {};
	const params: ReadParams = {};
	for (const name of TEXTS) {
		const value = checked(fields, name, "text", isText);
		if (value !== undefined) params[name] = value;
	}
	for (const name of COUNTS) {
		const value = checked(fields, name, "count", isCount);
		if (value !== undefined) params[name] = value;
	}
	for (const name of FLAGS) {
		const value = checked(fields, name, "flag", isFlag);
		if (value !== undefined) params[name] = value;
	}
	return params;
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
export function nextCall(
	params: ReadParams,
	change: Pick<ReadParams, "line" | "before" | "after" | "find">,
): ModelText {
	const flags = Object.entries(flagsOf(params)).filter(([, on]) => on);
	const call = { session: params.session, ...change, ...Object.fromEntries(flags) };
	return model.text("next-call", { arguments: JSON.stringify(call) });
}
