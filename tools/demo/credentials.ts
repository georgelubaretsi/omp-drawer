// The credentials a demo needs besides omp's models, as this Mac has them, only for a demo that
// names them. In the demo machine (vm/run.ts) each reaches the recorder on its stdin and is signed
// in there as its plugin tells a person to (place-machine.ts): never on a command line, in a file
// or in the image, and gone with the machine. On this Mac (place-host.ts) each is the variable its
// plugin reads (core/settings.json's secrets), set for the demo's agents, so nothing goes into
// this Mac's secret store.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Credential } from "./sandbox";

const KAGI_CLI_CONFIG = join(homedir(), ".config", "kagi-cli", "config.toml");

/** The token in `value`: a bare token, or a Session Link (`https://kagi.com/search?token=...`). */
function tokenOf(value: string): string | undefined {
	const v = value.trim();
	if (!/^https?:\/\//i.test(v)) return v || undefined;
	return URL.parse(v)?.searchParams.get("token") || undefined;
}

/**
 * Kagi's session token: KAGI_SESSION_TOKEN, else the one the kagi CLI keeps, whose
 * `session_token` may be the token or the whole Session Link; undefined when neither.
 */
export function kagiToken(env: Record<string, string | undefined>, config?: string): string | undefined {
	if (env.KAGI_SESSION_TOKEN) return tokenOf(env.KAGI_SESSION_TOKEN);
	if (config === undefined) return undefined;
	const auth: unknown = Reflect.get(Object(Bun.TOML.parse(config)), "auth");
	const token: unknown = auth && typeof auth === "object" ? Reflect.get(auth, "session_token") : undefined;
	return typeof token === "string" ? tokenOf(token) : undefined;
}

type Source = {
	/** The variable the plugin reads it from. */
	variable: string;
	/** The secret, from this Mac; undefined when it has none. */
	read: () => string | undefined;
	/** What the plugin's sign-in takes, made from the secret. */
	signIn: (secret: string) => string;
	/** Where `read` looks, for the error when it finds nothing. */
	where: string;
};

const SOURCES: Record<Credential, Source> = {
	kagi: {
		variable: "KAGI_SESSION_TOKEN",
		read: () =>
			kagiToken(process.env, existsSync(KAGI_CLI_CONFIG) ? readFileSync(KAGI_CLI_CONFIG, "utf8") : undefined),
		// The Session Link, as Kagi's settings give it and the vault's sign-in takes it.
		signIn: token => `https://kagi.com/search?token=${encodeURIComponent(token)}`,
		where: "KAGI_SESSION_TOKEN, or the kagi CLI signed in (~/.config/kagi-cli/config.toml)",
	},
};

/** The secret `name` from this Mac; throws naming where it is looked for. */
function secret(name: Credential): string {
	const found = SOURCES[name].read();
	if (!found) throw new Error(`this demo needs ${name}: ${SOURCES[name].where}`);
	return found;
}

/** For the demo machine: what each plugin's sign-in takes, for `names`. */
export function secretsFor(names: readonly Credential[]): Partial<Record<Credential, string>> {
	return Object.fromEntries(names.map(name => [name, SOURCES[name].signIn(secret(name))]));
}

/** For this Mac: each of `names` as the variable its plugin reads, name → value. */
export function variablesFor(names: readonly Credential[]): Record<string, string> {
	return Object.fromEntries(names.map(name => [SOURCES[name].variable, secret(name)]));
}
