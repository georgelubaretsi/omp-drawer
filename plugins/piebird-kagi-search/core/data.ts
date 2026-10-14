// Reading the vault's outputs (core/operations.json declares their shapes; the vault's golden
// replies are checked against them): a field of the wrong type reads as missing, so a vault that
// drifts shows as an empty detail, never as a crash in the middle of an answer.

export type Fields = Readonly<Record<string, unknown>>;

export function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `value` as fields; none when it isn't an object. */
export function fieldsOf(value: unknown): Fields {
	return isFields(value) ? value : {};
}

/** The text at `key`, trimmed; empty when there is none. */
export function textAt(f: Fields, key: string): string {
	const value = f[key];
	return typeof value === "string" ? value.trim() : "";
}

/** The number at `key`; 0 when there is none. */
export function numberAt(f: Fields, key: string): number {
	const value = f[key];
	return typeof value === "number" ? value : 0;
}

/** The objects in the list at `key`; none when it isn't a list. */
export function itemsAt(f: Fields, key: string): Fields[] {
	const value = f[key];
	return Array.isArray(value) ? value.filter(isFields) : [];
}

/** The texts in the list at `key`, trimmed. */
export function textsAt(f: Fields, key: string): string[] {
	const value = f[key];
	return Array.isArray(value) ? value.filter(v => typeof v === "string").map(v => v.trim()) : [];
}
