// Recording on this Mac, for the demos that need Claude Code and Codex signed in (the demo machine
// has neither): a throwaway folder with a Tern profile (its own config folder, daemon and control
// socket), an omp home with the plugins linked from this checkout, and the project. omp signs in
// through a local auth broker (`omp auth-broker serve`) that lends it your own omp sign-in, so
// nothing is copied and your omp, its plugins and your Tern stay as they are. A credential the
// scenario names is the variable its plugin reads, set for the demo's agents (credentials.ts),
// so nothing goes into this Mac's secret store. The window opens on this Mac's screen and must be
// signed in to Tern. Claude Code and Codex are set up by harness.ts.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { variablesFor } from "./credentials";
import { agentShell, setUpCodex, tearDownAgents } from "./harness";
import { run, type Sandbox, type SandboxOptions, ternBinary, writeOmpHome, writeTernSettings } from "./sandbox";

const BROKER_TOKEN = join(homedir(), ".omp", "auth-broker.token");

type Broker = { url: string; stop: () => void };

async function freePort(): Promise<number> {
	const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
	const { port } = server;
	server.stop(true);
	return port;
}

const answers = (url: string) =>
	fetch(url).then(
		() => true,
		() => false,
	);

/** Starts `omp auth-broker serve` on a free port and waits until it answers. */
async function startBroker(): Promise<Broker> {
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

/** Single-quoted for sh. */
const quoted = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

/**
 * The shell Tern runs in demo panes: zsh with the sandbox HOME, the broker, and the credentials'
 * `variables`. Tern starts a pane's shell with an environment of its own, so the variables come
 * from a file only you can read, in the sandbox, which goes with it.
 */
async function writeShell(root: string, home: string, brokerUrl: string, variables: Record<string, string>) {
	const shell = join(root, "bin", "zsh-demo");
	const secrets = join(root, "bin", "credentials.sh");
	await mkdir(join(root, "bin"), { recursive: true, mode: 0o700 });
	const exports = Object.entries(variables).map(([k, v]) => `export ${k}=${quoted(v)}`);
	await writeFile(secrets, `${exports.join("\n")}\n`, { mode: 0o600 });
	const lines = [
		"#!/bin/sh",
		"# A demo pane: the sandbox HOME, omp signed in through the auth broker, the demo's credentials.",
		`export HOME=${quoted(home)}`,
		`export OMP_AUTH_BROKER_URL=${quoted(brokerUrl)}`,
		// Each pane reads the token from your omp's file: the token never lands in the sandbox.
		`OMP_AUTH_BROKER_TOKEN=$(cat ${quoted(BROKER_TOKEN)})`,
		"export OMP_AUTH_BROKER_TOKEN",
		`. ${quoted(secrets)}`,
		'exec /bin/zsh "$@"',
	];
	await writeFile(shell, `${lines.join("\n")}\n`, { mode: 0o755 });
	return shell;
}

/** omp's home with the plugins linked, Tern's settings, and the other agents. */
async function fill(s: Sandbox, opts: SandboxOptions): Promise<void> {
	const agents = opts.agents ?? [];
	await writeOmpHome(s.home, await agentShell(s, agents, opts.plugins));
	await writeTernSettings(s.tern, opts.ternSettings);
	for (const name of opts.plugins) await s.installPlugin(name);
	if (agents.includes("codex")) await setUpCodex(s, opts.plugins, s.env);
}

/** Creates the sandbox on this Mac. Paths are short: Unix sockets cap their length. */
export async function hostSandbox(opts: SandboxOptions): Promise<Sandbox> {
	const root = await mkdtemp("/tmp/omp-demo-");
	const dirs = { home: join(root, "home"), tern: join(root, "tern"), logs: join(root, "logs"), tmp: join(root, "t") };
	const project = join(root, opts.projectName ?? "project");
	await Promise.all([...Object.values(dirs), project].map(d => mkdir(d, { recursive: true })));
	const broker = await startBroker().catch(async (error: unknown) => {
		await rm(root, { recursive: true, force: true });
		throw error;
	});
	const close = async (keep: boolean) => {
		broker.stop();
		await tearDownAgents({ root });
		if (!keep) await rm(root, { recursive: true, force: true });
	};
	try {
		const variables = variablesFor(opts.credentials ?? []);
		const env = {
			...process.env,
			...variables,
			HOME: dirs.home,
			PATH: `${dirname(ternBinary())}:${process.env.PATH ?? ""}`,
			OMP_AUTH_BROKER_URL: broker.url,
			OMP_AUTH_BROKER_TOKEN: (await readFile(BROKER_TOKEN, "utf8")).trim(),
		};
		const controlSocket = join(root, "c.sock");
		const ternEnv = {
			SHELL: await writeShell(root, dirs.home, broker.url, variables),
			TERN_CONFIG_DIR: dirs.tern,
			TERN_DAEMON_SOCKET: join(root, "d.sock"),
			STENCIL_LOG_DIR: dirs.logs,
			TMPDIR: dirs.tmp,
		};
		const installPlugin = async (name: string) => {
			await run(["omp", "plugin", "link", "--", join(opts.market, "plugins", name)], env);
		};
		const base = {
			root,
			home: dirs.home,
			tern: dirs.tern,
			project,
			controlSocket,
			ternEnv,
			env,
			market: opts.market,
		};
		const sandbox: Sandbox = { ...base, gate: "signed-in", installPlugin, close };
		await fill(sandbox, opts);
		return sandbox;
	} catch (error) {
		await close(false);
		throw error;
	}
}
