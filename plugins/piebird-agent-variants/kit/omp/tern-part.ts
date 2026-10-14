// Keeps this plugin's Tern part (<plugin>/so.stencil.tern) installed in the Tern that runs omp, at the
// version the plugin ships: Tern has no marketplace, so omp brings the part along. When omp starts
// as the main agent in a local Tern pane, it installs the part if Tern lacks it and replaces a copy
// of another version. A linked part (a checkout's) and one turned off in Tern's settings are left
// alone. The build copies kit/ into each plugin that needs it (plugins/<name>/kit/); edit it in
// kit/.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The Tern part, in the plugin's folder (this file is at kit/omp/ in it). */
export const TERN_PART_DIR = join(import.meta.dir, "..", "..", "so.stencil.tern");
const MACOS_APP_BINARY = "/Applications/Tern.app/Contents/MacOS/tern";

/** The tern command: TERN_BIN, else `tern` on PATH, else the macOS app's binary. */
export function ternBinary(): string | undefined {
	return process.env.TERN_BIN ?? Bun.which("tern") ?? (existsSync(MACOS_APP_BINARY) ? MACOS_APP_BINARY : undefined);
}

/**
 * Whether the pane's session daemon runs on another machine than the person driving it,
 * from the pane's TERN_IDENTITY: an identity chain whose hops each carry a `method`
 * (`local`, `ssh-key` or `tailscale`). Missing or unreadable means local.
 */
export function isRemotePane(identity: string | undefined): boolean {
	if (!identity) return false;
	let chain: unknown;
	try {
		chain = JSON.parse(identity);
	} catch {
		return false;
	}
	if (!chain || typeof chain !== "object" || !("hops" in chain) || !Array.isArray(chain.hops)) return false;
	return chain.hops.some(
		(hop: unknown) =>
			!!hop &&
			typeof hop === "object" &&
			"method" in hop &&
			typeof hop.method === "string" &&
			hop.method !== "local",
	);
}

/** The part as Tern has it: from `tern plugin list`, and whether a `<id>.path` link names it. */
export interface Installed {
	version: string;
	status: string;
	linked: boolean;
}

/** What to do about a part of version `want`, given Tern's copy of it. */
export function decide(want: string, installed: Installed | undefined): "none" | "install" | "replace" {
	if (!installed) return "install";
	if (installed.linked || installed.status === "disabled") return "none";
	return installed.version === want ? "none" : "replace";
}

export interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}
export type Run = (argv: string[]) => Promise<RunResult>;

/** Runs argv with no input, killed after 30 seconds. */
export const run: Run = async argv => {
	const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 30_000 });
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
};

/** The part's id and version, from its plugin.toml. */
export async function partManifest(dir: string = TERN_PART_DIR): Promise<{ id: string; version: string }> {
	const toml: unknown = Bun.TOML.parse(await readFile(join(dir, "plugin.toml"), "utf8"));
	const id: unknown = toml && typeof toml === "object" ? Reflect.get(toml, "id") : undefined;
	const version: unknown = toml && typeof toml === "object" ? Reflect.get(toml, "version") : undefined;
	if (typeof id !== "string" || typeof version !== "string")
		throw new Error(`${dir}/plugin.toml has no id or version`);
	return { id, version };
}

/** Tern's copy of plugin `id`, or undefined when Tern has none. */
export async function installedPart(tern: string, id: string, exec: Run = run): Promise<Installed | undefined> {
	const list = await exec([tern, "plugin", "list", "--json"]);
	if (list.code !== 0) throw new Error(list.stderr.trim() || `tern plugin list exited ${list.code}`);
	const parsed: unknown = JSON.parse(list.stdout);
	const plugins: unknown = parsed && typeof parsed === "object" ? Reflect.get(parsed, "plugins") : undefined;
	const entry: unknown = Array.isArray(plugins)
		? plugins.find((p: unknown) => !!p && typeof p === "object" && Reflect.get(p, "id") === id)
		: undefined;
	if (!entry || typeof entry !== "object") return undefined;
	const version: unknown = Reflect.get(entry, "version");
	const status: unknown = Reflect.get(entry, "status");
	const where = await exec([tern, "plugin", "dir"]);
	const linked = where.code === 0 && existsSync(join(where.stdout.trim(), `${id}.path`));
	return { version: String(version), status: String(status), linked };
}

export type Outcome =
	| { kind: "unchanged" }
	| { kind: "installed"; version: string }
	| { kind: "updated"; from: string; to: string }
	| { kind: "failed"; error: string; command: string };

/** Installs or replaces the part in `dir` when `decide` says so. */
export async function syncPart(tern: string, dir: string = TERN_PART_DIR, exec: Run = run): Promise<Outcome> {
	const { id, version } = await partManifest(dir);
	const before = await installedPart(tern, id, exec);
	const step = decide(version, before);
	if (step === "none") return { kind: "unchanged" };
	const argv = [tern, "plugin", "install", dir, ...(step === "replace" ? ["--force"] : [])];
	const result = await exec(argv);
	if (result.code !== 0) {
		// Another omp starting at the same time may have installed it first.
		const now = await installedPart(tern, id, exec).catch(() => undefined);
		if (now && decide(version, now) === "none") return { kind: "unchanged" };
		const error = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
		return { kind: "failed", error, command: `tern plugin install "${dir}" --force` };
	}
	return before ? { kind: "updated", from: before.version, to: version } : { kind: "installed", version };
}

/** The note shown to the person for an outcome; none when nothing changed. */
export function notice(plugin: string, outcome: Outcome): string | undefined {
	if (outcome.kind === "unchanged") return undefined;
	if (outcome.kind === "installed")
		return `Installed ${plugin}'s Tern part (${outcome.version}); Tern reloaded its plugins.`;
	if (outcome.kind === "updated")
		return `Updated ${plugin}'s Tern part from ${outcome.from} to ${outcome.to}; Tern reloaded its plugins.`;
	return `Couldn't install ${plugin}'s Tern part: ${outcome.error}. To install it by hand: ${outcome.command}`;
}

/**
 * What keepTernPart uses of omp's extension API (`ExtensionAPI` in `@oh-my-pi/pi-coding-agent`).
 * Declared here so this file needs no omp package to typecheck; each plugin passes its own `pi`,
 * so the plugin's typecheck checks omp's real type against this one.
 */
export interface SessionStarts {
	on(
		event: "session_start",
		handler: (
			event: unknown,
			ctx: {
				agent: { kind: string };
				hasUI: boolean;
				ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
			},
		) => void,
	): void;
}

/**
 * Runs `syncPart` once per omp process, in the background, when omp is the main agent in a local
 * Tern pane; the note goes to the person, not the model.
 */
export function keepTernPart(pi: SessionStarts, plugin: string): void {
	if (process.env.TERM_PROGRAM !== "tern" || isRemotePane(process.env.TERN_IDENTITY)) return;
	let started = false;
	pi.on("session_start", (_event, ctx) => {
		if (started || ctx.agent.kind !== "main") return;
		started = true;
		const tern = ternBinary();
		if (!tern) return;
		void (async () => {
			let outcome: Outcome;
			try {
				outcome = await syncPart(tern);
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				outcome = { kind: "failed", error, command: `tern plugin install "${TERN_PART_DIR}" --force` };
			}
			const text = notice(plugin, outcome);
			if (text && ctx.hasUI) ctx.ui.notify(text, outcome.kind === "failed" ? "error" : "info");
		})();
	});
}
