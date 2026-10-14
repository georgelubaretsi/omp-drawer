// Codex and ChatGPT desktop (the Codex app; both read ~/.codex): each plugin copied to
// ~/.codex/plugins/<plugin>/ with an mcp.json for its program, and listed in the personal
// marketplace. Installed then through the app's own codex command (or another one found), which
// copies it into Codex's cache and switches it on; with no command, those two are written as it
// would. The app loads plugins at its start. Codex's hooks aren't set up: Codex reviews a plugin's
// hooks itself before they run.
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { PayloadFile } from "../core/payload";
import { enablePlugins, marketplaceName, removePlugins, withEntries, withoutEntries } from "../core/codex";
import { type Ctx, firstLine, listed, skipped, type Step } from "./context";
import { readIfThere, replaceFile } from "../../kit/program/files";
import { readJson, replaceFolder, writeJson } from "./files";
import { MARKET, type Plugin, pluginFiles } from "./plugins";

const AGENT = "codex";

/**
 * The mcp.json that runs a plugin's program as its MCP server; Codex refuses one without its
 * $schema. On Windows that's the program's .exe: native/<name> is a POSIX shell starter there.
 */
export function codexMcpJson(name: string, windows: boolean): PayloadFile {
	const command = windows ? `./native/${name}.exe` : `./native/${name}`;
	const mcp = {
		$schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
		mcpServers: { [name]: { type: "stdio", command, args: ["mcp"] } },
	};
	return { path: "mcp.json", mode: 0o644, data: new TextEncoder().encode(`${JSON.stringify(mcp, null, 2)}\n`) };
}

export function codexCopy(ctx: Ctx, p: Plugin): PayloadFile[] {
	const mcp = p.program ? [codexMcpJson(p.name, ctx.sys.platform === "win32")] : [];
	return [...pluginFiles(ctx.payload, p.name), ...mcp];
}

function cacheDir(ctx: Ctx, market: string, name: string): string {
	return join(ctx.dirs.codexHome, "plugins", "cache", market, name);
}

function configFile(ctx: Ctx): string {
	return join(ctx.dirs.codexHome, "config.toml");
}

function byHand(ctx: Ctx, plugins: readonly Plugin[], market: string): void {
	for (const p of plugins) {
		const files = codexCopy(ctx, p).map(f => ({ ...f, path: `${p.version || "local"}/${f.path}` }));
		replaceFolder(cacheDir(ctx, market, p.name), files);
	}
	const ids = plugins.map(p => `${p.name}@${market}`);
	replaceFile(configFile(ctx), enablePlugins(readIfThere(configFile(ctx)) ?? "", ids));
}

async function withCommand(
	ctx: Ctx,
	codex: string,
	plugins: readonly Plugin[],
	market: string,
): Promise<string | undefined> {
	for (const p of plugins) {
		const ran = await ctx.sys.run([codex, "plugin", "add", `${p.name}@${market}`]);
		if (ran.code !== 0) return `${p.name} didn't install: ${firstLine(ran.stderr || ran.stdout)}`;
	}
	return undefined;
}

export async function codexInstall(ctx: Ctx, plugins: readonly Plugin[]): Promise<Step> {
	const { codex, apps } = ctx.agents;
	if (plugins.length === 0 || (!codex && !apps.chatgpt)) return skipped(AGENT);
	for (const p of plugins) replaceFolder(join(ctx.dirs.codexSources, p.name), codexCopy(ctx, p));
	const existing = readJson(ctx.dirs.personalMarket);
	const market = marketplaceName(existing, MARKET);
	writeJson(ctx.dirs.personalMarket, withEntries(existing, MARKET, plugins));
	if (codex) {
		const problem = await withCommand(ctx, codex, plugins, market);
		if (problem) return { agent: AGENT, ok: false, text: `Codex: ${problem}` };
	} else byHand(ctx, plugins, market);
	const names = listed(plugins.map(p => p.name));
	if (!apps.chatgpt) return { agent: AGENT, ok: true, text: `Codex: ${names} installed; new sessions have them.` };
	return {
		agent: AGENT,
		ok: true,
		text: `ChatGPT (Codex and Work): ${names} installed; ChatGPT has them after a restart.`,
		restart: "chatgpt",
	};
}

/** Removes what codexInstall wrote, as `codex plugin remove` does; the plugins' saved data stays. */
export function codexUninstall(ctx: Ctx): Step {
	const existing = readJson(ctx.dirs.personalMarket);
	const market = marketplaceName(existing, MARKET);
	const ours = ctx.plugins.filter(p => p.hosts.includes("codex")).map(p => p.name);
	const present = ours.filter(
		n => ctx.sys.exists(join(ctx.dirs.codexSources, n)) || ctx.sys.exists(cacheDir(ctx, market, n)),
	);
	if (present.length === 0) return skipped(AGENT);
	const config = readIfThere(configFile(ctx));
	if (config !== undefined)
		replaceFile(
			configFile(ctx),
			removePlugins(
				config,
				present.map(n => `${n}@${market}`),
			),
		);
	const listedThere = withoutEntries(existing, present);
	if (listedThere) writeJson(ctx.dirs.personalMarket, listedThere);
	for (const n of present) {
		rmSync(cacheDir(ctx, market, n), { recursive: true, force: true });
		rmSync(join(ctx.dirs.codexSources, n), { recursive: true, force: true });
	}
	if (!ctx.agents.apps.chatgpt) return { agent: AGENT, ok: true, text: "Codex: the piebird plugins are removed." };
	return {
		agent: AGENT,
		ok: true,
		text: "ChatGPT: the piebird plugins are removed; ChatGPT lets go of them after a restart.",
		restart: "chatgpt",
	};
}
