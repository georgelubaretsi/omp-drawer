// Calling a plugin's vault: the signed native program that holds its secrets and performs the
// operations that need one (core/operations.json, `vault: true`). The protocol: `<vault> call
// <operation>`, the input as JSON on stdin; on stdout one JSON object, `{"output": ...}` or
// `{"error": {"id": "<declared error>", "variables": {...}}}`, with exit status 0 for both. Anything
// else is a failure of the vault itself. The caller turns the reply into text from its catalog.
import type { Io } from "./io";
import type { CallSignal } from "./operations";

export type VaultReply =
	| { readonly kind: "output"; readonly output: unknown }
	| { readonly kind: "error"; readonly id: string; readonly variables: Readonly<Record<string, string | number>> }
	/** The vault didn't answer by the protocol; `detail` is for logs, not the model. */
	| { readonly kind: "failed"; readonly detail: string };

const TIMEOUT_MS = 60_000;

function variables(value: unknown): Readonly<Record<string, string | number>> {
	if (typeof value !== "object" || value === null) return {};
	const out: Record<string, string | number> = {};
	for (const [k, v] of Object.entries(value)) if (typeof v === "string" || typeof v === "number") out[k] = v;
	return out;
}

/** The vault's reply to `stdout`, a run that exited 0. */
export function parseReply(stdout: string): VaultReply {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return { kind: "failed", detail: `the vault's answer isn't JSON: ${stdout.slice(0, 200)}` };
	}
	if (typeof parsed !== "object" || parsed === null)
		return { kind: "failed", detail: "the vault's answer isn't an object" };
	if ("output" in parsed) return { kind: "output", output: parsed.output };
	const error: unknown = "error" in parsed ? parsed.error : undefined;
	if (typeof error === "object" && error !== null && "id" in error && typeof error.id === "string") {
		return { kind: "error", id: error.id, variables: variables("variables" in error ? error.variables : undefined) };
	}
	return { kind: "failed", detail: "the vault's answer has neither output nor error" };
}

/**
 * Where the plugin at `plugin` keeps its vault `program`: native/<program>, a starter that runs this
 * system's build, or native/<program>.exe on Windows (docs/manifests.md, "Native programs").
 */
export function vaultPath(plugin: string, program: string, windows: boolean): string {
	return windows ? `${plugin}\\native\\${program}.exe` : `${plugin}/native/${program}`;
}

/** One call of a vault: its operation, the input, and the signal of the call it serves. */
export interface VaultCall {
	readonly operation: string;
	readonly input: unknown;
	readonly signal?: CallSignal;
}

export async function callVault(io: Io, vault: string, call: VaultCall): Promise<VaultReply> {
	const run = await io.run([vault, "call", call.operation], {
		stdin: JSON.stringify(call.input),
		timeoutMs: TIMEOUT_MS,
		...(call.signal === undefined ? {} : { signal: call.signal }),
	});
	if (run.exitCode !== 0)
		return { kind: "failed", detail: `the vault exited ${run.exitCode}: ${run.stderr.slice(0, 500)}` };
	return parseReply(run.stdout);
}
