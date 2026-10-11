// Journal entries are untyped JSON written by whichever omp version ran the session: these read
// them without trusting their shape.

export type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asObject(value: unknown): JsonObject | undefined {
	return isObject(value) ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? (value as unknown[]) : [];
}

export function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/** A string field's text, or "" when it is missing or not a string. */
export function textOf(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** One journal line as an object, or undefined when it isn't one (a line cut off mid-write). */
export function parseLine(raw: string): JsonObject | undefined {
	try {
		return asObject(JSON.parse(raw));
	} catch {
		return undefined;
	}
}
