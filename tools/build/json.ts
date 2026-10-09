// JSON values, JSON Pointer locations and the error that carries every problem found.

export type Json = null | boolean | number | string | Json[] | JsonObject;
export interface JsonObject {
	[key: string]: Json;
}

export class ValidationError extends Error {
	constructor(readonly problems: string[]) {
		super(problems.join("\n"));
	}
}

export function isObject(v: unknown): v is JsonObject {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function toJson(v: Json): string {
	return `${JSON.stringify(v, null, 2)}\n`;
}

/** One JSON Pointer reference token (RFC 6901). */
export function pointerToken(key: string): string {
	return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** `<file>:` followed by the JSON Pointer when it isn't the whole document. */
export function located(file: string, pointer: string): string {
	return `${file}:${pointer === "" ? "" : ` ${pointer}`}`;
}
