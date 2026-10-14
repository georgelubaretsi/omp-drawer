// The Kagi tools' handlers, the same in every shell: each sends its operation to the vault, which
// holds the session and talks to Kagi (cmd/kagi-vault), and turns the reply into what the model
// reads. `format` is the one argument the vault never sees: it picks the answer's form here.
import type { Io } from "../kit/core/io";
import type { CallSignal, Handlers, Outcome } from "../kit/core/operations";
import type { VaultReply } from "../kit/core/vault";
import { callVault } from "../kit/core/vault";
import { fieldsOf, isFields } from "./data";
import { errorText, kagiDown } from "./errors";
import { formatters } from "./format";
import { model } from "./model.gen";
import { operations } from "./operations.gen";

const FORMATS = ["markdown", "json"];

/** Where the vault is and how to run it. */
interface Vault {
	readonly io: Io;
	readonly path: string;
}

async function ask(vault: Vault, operation: string, input: unknown, signal?: CallSignal): Promise<VaultReply> {
	try {
		return await callVault(vault.io, vault.path, { operation, input, ...(signal ? { signal } : {}) });
	} catch (error) {
		return { kind: "failed", detail: error instanceof Error ? error.message : String(error) };
	}
}

function outcomeOf(operation: string, reply: VaultReply, json: boolean): Outcome {
	if (reply.kind === "error") return { ok: false, error: reply.id, text: errorText(reply.id, reply.variables) };
	if (reply.kind === "failed")
		return { ok: false, error: "vault", text: model.text("error-vault", { detail: reply.detail }) };
	const formatter = formatters[operation];
	const text =
		json || formatter === undefined
			? model.text("json", { json: JSON.stringify(reply.output) })
			: formatter(fieldsOf(reply.output));
	return { ok: true, text, data: reply.output };
}

async function perform(vault: Vault, operation: string, input: unknown, signal?: CallSignal): Promise<Outcome> {
	const { format, ...rest } = fieldsOf(input);
	if (format !== undefined && (typeof format !== "string" || !FORMATS.includes(format))) {
		const got = typeof format === "string" ? format : JSON.stringify(format);
		const variables = { name: "format", values: FORMATS.join(", "), got };
		return { ok: false, error: "one-of", text: errorText("one-of", variables) };
	}
	const reply = await ask(vault, operation, isFields(input) ? rest : input, signal);
	return outcomeOf(operation, reply, format === "json");
}

/**
 * A handler per Kagi tool, each calling the vault at `vault` through `io`, stopped when its call is
 * cancelled; `failed` hears of each outcome saying Kagi isn't working (kagiDown), for the "search"
 * setting.
 */
export function handlersFor(io: Io, vault: string, failed: () => void = () => undefined): Handlers {
	return Object.fromEntries(
		operations.tools.map(op => [
			op.id,
			async (input: unknown, signal?: CallSignal) => {
				const outcome = await perform({ io, path: vault }, op.id, input, signal);
				// A call cancelled midway stopped the vault; that says nothing about Kagi.
				if (kagiDown(outcome) && signal?.aborted !== true) failed();
				return outcome;
			},
		]),
	);
}
