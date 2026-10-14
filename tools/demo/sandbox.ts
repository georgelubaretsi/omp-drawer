// A throwaway place to record a demo in: a Tern profile (its own config folder, daemon and
// control socket), an omp home with the plugin under test linked from this checkout, and a project
// folder. omp signs in through a local auth broker (`omp auth-broker serve`) that lends it your own
// omp sign-in, so nothing is copied and your omp, its plugins and your Tern stay as they are.
// Claude Code and Codex, for a plugin that works in them too, are set up by harness.ts.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { agentShell, CLAUDE_MODEL, CODEX_MODEL, codexHome, setUpCodex, tearDownAgents } from "./harness";

/** The model demos run on: cheap and quick. */
export const DEMO_MODEL = "anthropic/claude-haiku-5-5:low";

const MACOS_TERN = "/Applications/Tern.app/Contents/MacOS/tern";
const BROKER_TOKEN = join(homedir(), ".omp", "auth-broker.token");

export function ternBinary(): string {
	const found = process.env.TERN_BIN ?? Bun.which("tern") ?? (existsSync(MACOS_TERN) ? MACOS_TERN : undefined);
	if (!found) throw new Error("the tern command was not found (set TERN_BIN)");
	return found;
}

export interface Sandbox {
	root: string;
	/** omp's HOME in demo panes. */
	home: string;
	/** Tern's config folder (TERN_CONFIG_DIR). */
	tern: string;
	/** The project the demo works in: the first tab opens here. */
	project: string;
	controlSocket: string;
	daemonSocket: string;
	logs: string;
	tmp: string;
	/** The shell demo panes run: zsh with the sandbox HOME, the broker and `tern` on PATH. */
	shell: string;
	broker: { url: string; stop: () => void };
	/** The environment of a demo pane, for running omp in `setup`. */
	env: Record<string, string | undefined>;
	/** The checkout's plugins/ folder. */
	market: string;
}

export interface SandboxOptions {
	/** The plugins to link into the sandbox omp, by folder under plugins/plugins/. */
	plugins: string[];
	/** The checkout's plugins/ folder. */
	market: string;
	/**
	 * Credentials the sandbox needs besides omp's: "kagi" needs KAGI_SESSION_TOKEN in the recorder's
	 * environment, which the panes inherit; the sandbox keeps no copy.
	 */
	credentials?: "kagi"[];
	/** Tern settings for the demo window, over the defaults below. */
	ternSettings?: Record<string, unknown>;
	/** The project folder's name, as its tab shows it. */
	projectName?: string;
	/** Agents besides omp the demo runs, with the plugins (harness.ts). */
	agents?: ("claude" | "codex")[];
}

async function freePort(): Promise<number> {
	const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
	const { port } = server;
	server.stop(true);
	return port;
}

async function run(argv: string[], env: Record<string, string | undefined>, cwd?: string): Promise<string> {
	const proc = Bun.spawn(argv, { env, cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`${argv.join(" ")} exited ${code}: ${err.trim() || out.trim()}`);
	return out;
}

const answers = (url: string) =>
	fetch(url).then(
		() => true,
		() => false,
	);

/** Starts `omp auth-broker serve` on a free port and waits until it answers. */
async function startBroker(): Promise<Sandbox["broker"]> {
	const port = await freePort();
	const proc = Bun.spawn(["omp", "auth-broker", "serve", "--bind", `127.0.0.1:${port}`], {
		stdout: "ignore",
		stderr: "ignore",
		stdin: "ignore",
	});
	const url = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 100; i++) {
		if (await answers(url)) return { url, stop: () => proc.kill() };
		await Bun.sleep(100);
	}
	proc.kill();
	throw new Error("omp auth-broker serve did not start");
}

/**
 * omp's settings in the sandbox (the demo model in every role, omp's dark theme, no first-run
 * setup) and the shell's: `rc` and `env` add lines to .zshrc and .zshenv.
 */
async function writeOmpHome(home: string, shell: { rc: string[]; env: string[] }): Promise<void> {
	const agent = join(home, ".omp", "agent");
	await mkdir(agent, { recursive: true });
	const roles = ["default", "smol", "tiny", "task", "slow", "plan"].map(role => `  ${role}: ${DEMO_MODEL}`);
	const config = ["theme:", "  dark: dark-arctic", "  light: light", "setupVersion: 2", "modelRoles:", ...roles];
	await writeFile(join(agent, "config.yml"), `${config.join("\n")}\n`);
	const version = (await run(["omp", "--version"], process.env)).trim().replace(/^omp\//, "");
	await writeFile(join(agent, "last-changelog-version"), version);
	// A short prompt with only the folder's name; omp starts on the demo model.
	const rc = [`PROMPT='%F{cyan}%1~%f ❯ '`, `alias omp='omp --model ${DEMO_MODEL}'`, ...shell.rc];
	await writeFile(join(home, ".zshrc"), `${rc.join("\n")}\n`);
	// `tern` on PATH, as Tern's users have it. Here, not in the shell wrapper: a system zshenv
	// (nix-darwin's) may set PATH afresh in every shell.
	const env = [`export PATH='${dirname(ternBinary())}':"$PATH"`, ...shell.env];
	await writeFile(join(home, ".zshenv"), `${env.join("\n")}\n`);
}

/** The shell Tern runs in demo panes: zsh with the sandbox HOME and the broker. */
async function writeShell(root: string, home: string, brokerUrl: string): Promise<string> {
	const shell = join(root, "bin", "zsh-demo");
	await mkdir(join(root, "bin"), { recursive: true });
	const lines = [
		"#!/bin/sh",
		"# A demo pane: the sandbox HOME, and omp signed in through the auth broker.",
		`export HOME='${home}'`,
		`export OMP_AUTH_BROKER_URL='${brokerUrl}'`,
		// Each pane reads the token from your omp's file: the token never lands in the sandbox.
		`OMP_AUTH_BROKER_TOKEN=$(cat '${BROKER_TOKEN}')`,
		"export OMP_AUTH_BROKER_TOKEN",
		'exec /bin/zsh "$@"',
	];
	await writeFile(shell, `${lines.join("\n")}\n`, { mode: 0o755 });
	return shell;
}

/** Runs omp on the demo model in the sandbox's project, as a demo pane would: its output. */
export function omp(s: Sandbox, ...args: string[]): Promise<string> {
	return run(["omp", "--model", DEMO_MODEL, ...args], s.env, s.project);
}

/**
 * Runs Claude Code on its demo model in the project, under your own login, as its demo panes do:
 * its output. Its transcript goes with the sandbox (harness.ts).
 */
export function claude(s: Sandbox, ...args: string[]): Promise<string> {
	return run(["claude", "--model", CLAUDE_MODEL, ...args], { ...s.env, HOME: homedir() }, s.project);
}

/** Runs Codex on its demo model in the project, with the sandbox's Codex home: its output. */
export function codex(s: Sandbox, ...args: string[]): Promise<string> {
	return run(["codex", "-m", CODEX_MODEL, ...args], { ...s.env, CODEX_HOME: codexHome(s) }, s.project);
}

/** Links a plugin of this checkout into the sandbox's omp, as installing it would. */
export async function linkPlugin(s: Sandbox, name: string): Promise<void> {
	await run(["omp", "plugin", "link", "--", join(s.market, "plugins", name)], s.env);
}

/** Creates the sandbox; `close` undoes it. Paths are short: Unix sockets cap their length. */
export async function createSandbox(opts: SandboxOptions): Promise<Sandbox> {
	const root = await mkdtemp("/tmp/omp-demo-");
	const s = {
		root,
		home: join(root, "home"),
		tern: join(root, "tern"),
		project: join(root, opts.projectName ?? "project"),
		controlSocket: join(root, "c.sock"),
		daemonSocket: join(root, "d.sock"),
		logs: join(root, "logs"),
		tmp: join(root, "t"),
	};
	await Promise.all([s.home, s.tern, s.project, s.logs, s.tmp].map(d => mkdir(d, { recursive: true })));
	const broker = await startBroker().catch(async (error: unknown) => {
		await rm(root, { recursive: true, force: true });
		throw error;
	});
	try {
		const env = {
			...process.env,
			HOME: s.home,
			PATH: `${dirname(ternBinary())}:${process.env.PATH ?? ""}`,
			OMP_AUTH_BROKER_URL: broker.url,
			OMP_AUTH_BROKER_TOKEN: (await readFile(BROKER_TOKEN, "utf8")).trim(),
		};
		const shell = await writeShell(root, s.home, broker.url);
		const sandbox = { ...s, shell, broker, env, market: opts.market };
		await fill(sandbox, opts);
		return sandbox;
	} catch (error) {
		await closeSandbox({ root, broker });
		throw error;
	}
}

/** omp's home with the plugins linked, Tern's settings, and the other agents; fails first without a credential the demo needs. */
async function fill(s: Sandbox, opts: SandboxOptions): Promise<void> {
	if (opts.credentials?.includes("kagi") && !process.env.KAGI_SESSION_TOKEN)
		throw new Error(
			"this demo needs KAGI_SESSION_TOKEN: the token in your Kagi Session Link (kagi.com/settings/user_details)",
		);
	const agents = opts.agents ?? [];
	await writeOmpHome(s.home, await agentShell(s, agents, opts.plugins));
	const settings = { theme: "Dark", tabs: "Horizontal", font_size: 13, reduce_motion: "on", ...opts.ternSettings };
	await writeFile(join(s.tern, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
	for (const name of opts.plugins) await linkPlugin(s, name);
	if (agents.includes("codex")) await setUpCodex(s, opts.plugins, s.env);
}

/** Stops the broker, puts back what the other agents changed, and removes the sandbox. */
export async function closeSandbox(s: Pick<Sandbox, "root" | "broker">, keep = false): Promise<void> {
	s.broker.stop();
	await tearDownAgents(s);
	if (!keep) await rm(s.root, { recursive: true, force: true });
}
