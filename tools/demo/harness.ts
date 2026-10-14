// Claude Code and Codex in a demo, for a plugin that works in them too; each runs on its demo
// model, with the plugin from this checkout.
//   Claude Code runs under your own login and config (its login is in your keychain, under its
//   default config), with `--plugin-dir`: the plugin loads for that session only, nothing is
//   installed. Its transcript of the demo, under ~/.claude/projects, is removed afterwards.
//   Codex loads plugins only by installing them, so it gets a CODEX_HOME in the sandbox whose
//   auth.json links to yours: nothing is copied. It installs them as the desktop installer gives
//   them to it. Should Codex replace the link with a refreshed login, that file goes back to yours
//   before the sandbox is removed.
import { copyFile, cp, lstat, mkdir, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import catalog from "../../catalog.json" with { type: "json" };
import { codexMcpJson } from "../../installer/steps/codex";
import type { Agent } from "./agents";
import type { Journals } from "./journal";

export const CLAUDE_MODEL = "claude-haiku-5-5";
export const CODEX_MODEL = "gpt-6.1-sol";

const CODEX_AUTH = join(homedir(), ".codex", "auth.json");
const CLAUDE_PROJECTS = join(homedir(), ".claude", "projects");

/** The parts of a sandbox the agents need. */
export interface Place {
	root: string;
	home: string;
	project: string;
	market: string;
}

export const codexHome = (p: Pick<Place, "root">) => join(p.root, "codex");

/** Where `agent` keeps the demo's journals. */
export function journalsOf(p: Place, agent: Agent): Journals {
	if (agent === "omp") return { dir: join(p.home, ".omp", "agent", "sessions"), glob: "*/*.jsonl" };
	if (agent === "claude") return { dir: CLAUDE_PROJECTS, glob: `*${basename(p.root)}*/*.jsonl` };
	return { dir: join(codexHome(p), "sessions"), glob: "**/*.jsonl" };
}

/**
 * What Claude Code may call without asking: each plugin's tools, which its mod registers as
 * `mcp__<plugin>__<tool>` (kit/claude/tools.ts).
 */
async function claudeTools(p: Place, plugins: string[]): Promise<string[]> {
	const tools: string[] = [];
	for (const name of plugins) {
		if (await Bun.file(join(p.market, "plugins", name, "core", "operations.json")).exists())
			tools.push(`mcp__${name}`);
	}
	return tools;
}

/** The shell lines that make `claude` and `codex` in demo panes start as the demo needs. */
export async function agentShell(
	p: Place,
	agents: Agent[],
	plugins: string[],
): Promise<{ rc: string[]; env: string[] }> {
	const rc: string[] = [];
	const env: string[] = [];
	if (agents.includes("claude")) {
		const dirs = plugins.map(name => `--plugin-dir '${join(p.market, "plugins", name)}'`);
		const allowed = (await claudeTools(p, plugins)).map(tool => `--allowedTools '${tool}'`);
		rc.push(
			`alias claude="HOME='${homedir()}' command claude --model ${CLAUDE_MODEL} ${[...dirs, ...allowed].join(" ")}"`,
		);
	}
	if (agents.includes("codex")) {
		env.push(`export CODEX_HOME='${codexHome(p)}'`);
		rc.push(`alias codex='command codex -m ${CODEX_MODEL}'`);
	}
	return { rc, env };
}

async function run(argv: string[], env: Record<string, string | undefined>): Promise<void> {
	const proc = Bun.spawn(argv, { env, stdout: "ignore", stderr: "pipe", stdin: "ignore" });
	const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new Error(`${argv.join(" ")} exited ${code}: ${err.trim()}`);
}

/**
 * The plugins as the desktop installer gives them to Codex (installer/steps/codex.ts): a copy of
 * each with an mcp.json for its program, in a marketplace of their own.
 */
async function codexMarket(p: Place, plugins: string[]): Promise<string> {
	const market = join(p.root, "codex-market");
	for (const name of plugins) {
		const to = join(market, "plugins", name);
		await cp(join(p.market, "plugins", name), to, { recursive: true, filter: src => !src.includes("/node_modules") });
		if (await Bun.file(join(to, "native", name)).exists()) {
			const mcp = codexMcpJson(name, process.platform === "win32");
			await writeFile(join(to, mcp.path), mcp.data);
		}
	}
	const entries = plugins.map(name => ({
		name,
		source: { source: "local", path: `./plugins/${name}` },
		policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
		category: catalog.plugins.find(e => e.name === name)?.category ?? "development",
	}));
	await mkdir(join(market, ".agents", "plugins"), { recursive: true });
	await writeFile(
		join(market, ".agents", "plugins", "marketplace.json"),
		`${JSON.stringify({ name: catalog.name, plugins: entries }, null, 2)}\n`,
	);
	return market;
}

/** Codex's home in the sandbox: your login linked, the project trusted, the plugins installed. */
export async function setUpCodex(p: Place, plugins: string[], env: Record<string, string | undefined>): Promise<void> {
	const home = codexHome(p);
	await mkdir(home, { recursive: true });
	await symlink(CODEX_AUTH, join(home, "auth.json"));
	const project = await realpath(p.project);
	const config = [
		`model = "${CODEX_MODEL}"`,
		'approval_policy = "never"',
		'sandbox_mode = "workspace-write"',
		"",
		`[projects."${project}"]`,
		'trust_level = "trusted"',
	];
	await writeFile(join(home, "config.toml"), `${config.join("\n")}\n`);
	const codexEnv = { ...env, CODEX_HOME: home };
	await run(["codex", "plugin", "marketplace", "add", await codexMarket(p, plugins)], codexEnv);
	for (const name of plugins) await run(["codex", "plugin", "add", `${name}@${catalog.name}`], codexEnv);
}

/** Puts back a login Codex refreshed in the sandbox, and removes Claude Code's demo transcript. */
export async function tearDownAgents(p: Pick<Place, "root">): Promise<void> {
	const linked = join(codexHome(p), "auth.json");
	const info = await lstat(linked).catch(() => undefined);
	if (info?.isFile()) {
		const yours = await stat(CODEX_AUTH).catch(() => undefined);
		if (!yours || info.mtimeMs > yours.mtimeMs) await copyFile(linked, CODEX_AUTH);
	}
	const projects = await readdir(CLAUDE_PROJECTS).catch(() => []);
	for (const name of projects.filter(entry => entry.includes(basename(p.root))))
		await rm(join(CLAUDE_PROJECTS, name), { recursive: true, force: true });
}
