// The vault's golden replies (cmd/kagi-vault/testdata/: each call in calls.json and the vault's
// reply to it against a fake Kagi serving captured pages, in replies/), served to the plugin's core
// as the vault would answer them.
import type { Io, RunOptions, RunResult } from "../kit/core/io";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TESTDATA = join(import.meta.dir, "..", "..", "..", "cmd", "kagi-vault", "testdata");

export interface GoldenCall {
	readonly name: string;
	readonly op: string;
	readonly input: Readonly<Record<string, unknown>>;
	/** The session the vault kept: Kagi's when absent, "stale" or "none". */
	readonly session?: string;
}

function isCall(value: unknown): value is GoldenCall {
	if (typeof value !== "object" || value === null) return false;
	const { name, op, input } = { name: undefined, op: undefined, input: undefined, ...value };
	return typeof name === "string" && typeof op === "string" && typeof input === "object" && input !== null;
}

const parsedCalls: unknown = JSON.parse(readFileSync(join(TESTDATA, "calls.json"), "utf8"));
export const CALLS: readonly GoldenCall[] = Array.isArray(parsedCalls) ? parsedCalls.filter(isCall) : [];

/** The vault's reply to the call `name`, as it wrote it. */
export function replyText(name: string): string {
	return readFileSync(join(TESTDATA, "replies", `${name}.json`), "utf8");
}

/** A value's JSON with object keys in order, to compare inputs. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (typeof value !== "object" || value === null) return JSON.stringify(value);
	const entries = Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/** The golden call for `operation` with `input`, the ones named in `prefer` first. */
export function goldenFor(operation: string, input: unknown, prefer: readonly string[] = []): GoldenCall | undefined {
	const key = canonical(input);
	const ordered = [...CALLS].toSorted((a, b) => Number(prefer.includes(b.name)) - Number(prefer.includes(a.name)));
	return ordered.find(c => c.op === operation && canonical(c.input) === key);
}

/**
 * An Io whose `run` answers `<vault> call <operation>` from the golden replies, and records each
 * operation it was asked; a call it has no reply for exits 1, as a vault that fails. Files are
 * `files`, by path; the rest are missing.
 */
export function goldenIo(
	options: { prefer?: readonly string[]; files?: Readonly<Record<string, string>> } = {},
): Io & { readonly asked: string[] } {
	const asked: string[] = [];
	return {
		asked,
		readText: async path => options.files?.[path],
		readPieces: async () => undefined,
		list: async () => undefined,
		async run(argv: readonly string[], run?: RunOptions): Promise<RunResult> {
			const operation = argv[2] ?? "";
			asked.push(operation);
			const call = goldenFor(operation, JSON.parse(run?.stdin ?? "null"), options.prefer);
			if (call === undefined) return { exitCode: 1, stdout: "", stderr: `no golden reply for ${operation}` };
			return { exitCode: 0, stdout: replyText(call.name), stderr: "" };
		},
	};
}
