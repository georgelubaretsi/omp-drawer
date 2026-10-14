// Claude Code and Claude desktop's Code tab, which share ~/.claude: the shared copy as a directory
// marketplace, whose plugins load in place from it. Through Claude Code's own command when one is
// found; else written into settings.json as the command would (the first session after may load
// them in the background). A piebird marketplace from somewhere else (a checkout) is left alone.
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { withMarketplace, withoutMarketplace } from "../core/claude";
import { type Ctx, fieldsOf, firstLine, listed, listOf, parsed, skipped, type Step } from "./context";
import { readJson, writeJson } from "./files";
import { MARKET, type Plugin } from "./plugins";

const AGENT = "claude";

function foreign(from: string): Step {
	return {
		agent: AGENT,
		ok: true,
		text: `Claude Code has its piebird plugins from ${from}; they were left as they are.`,
	};
}

/** A marketplace source's folder, repository or address. */
function where(source: Readonly<Record<string, unknown>>): string {
	return (
		[source.path, source.repo, source.url, source.source].find((v): v is string => typeof v === "string") ??
		"elsewhere"
	);
}

/** Where Claude Code's command has the piebird marketplace from, if it has it. */
async function registered(ctx: Ctx, claude: string): Promise<string | undefined> {
	const list = listOf(parsed((await ctx.sys.run([claude, "plugin", "marketplace", "list", "--json"])).stdout));
	const market = list.map(fieldsOf).find(m => m.name === MARKET);
	return market ? where(market) : undefined;
}

/** Where settings.json has the piebird marketplace from, if it has it. */
function declared(settings: unknown): string | undefined {
	const market = fieldsOf(fieldsOf(settings).extraKnownMarketplaces)[MARKET];
	return market === undefined ? undefined : where(fieldsOf(fieldsOf(market).source));
}

async function withCommand(ctx: Ctx, claude: string, plugins: readonly Plugin[]): Promise<Step> {
	const run = (...args: string[]) => ctx.sys.run([claude, "plugin", ...args]);
	const ours = realpathSync(ctx.dirs.market);
	const have = await registered(ctx, claude);
	if (have !== undefined && have !== ours) return foreign(have);
	if (have === undefined) {
		const added = await run("marketplace", "add", ours);
		if (added.code !== 0)
			return { agent: AGENT, ok: false, text: `Claude Code: ${firstLine(added.stderr || added.stdout)}` };
	}
	for (const { name } of plugins) await run("install", `${name}@${MARKET}`, "--scope", "user");
	const on = new Set(
		listOf(parsed((await run("list", "--json")).stdout))
			.map(fieldsOf)
			.filter(p => p.enabled === true)
			.map(p => p.id),
	);
	const missing = plugins.map(p => p.name).filter(n => !on.has(`${n}@${MARKET}`));
	if (missing.length > 0) return { agent: AGENT, ok: false, text: `Claude Code: ${listed(missing)} didn't install` };
	const which = ctx.agents.apps.claude ? "Claude Code and Claude's Code tab" : "Claude Code";
	return {
		agent: AGENT,
		ok: true,
		text: `${which}: ${listed(plugins.map(p => p.name))} installed; new sessions have them.`,
	};
}

export async function claudeInstall(ctx: Ctx, plugins: readonly Plugin[]): Promise<Step> {
	if (plugins.length === 0) return skipped(AGENT);
	if (ctx.agents.claude) return withCommand(ctx, ctx.agents.claude, plugins);
	if (!ctx.agents.apps.claude && !ctx.sys.exists(ctx.dirs.claudeHome)) return skipped(AGENT);
	const file = join(ctx.dirs.claudeHome, "settings.json");
	const settings = readJson(file);
	const ours = realpathSync(ctx.dirs.market);
	const have = declared(settings);
	if (have !== undefined && have !== ours) return foreign(have);
	writeJson(
		file,
		withMarketplace(
			settings,
			MARKET,
			ours,
			plugins.map(p => `${p.name}@${MARKET}`),
		),
	);
	return {
		agent: AGENT,
		ok: true,
		text: `Claude's Code tab: ${listed(plugins.map(p => p.name))} added; new sessions load them.`,
	};
}

export async function claudeUninstall(ctx: Ctx): Promise<Step> {
	const ours = ctx.sys.exists(ctx.dirs.market) ? realpathSync(ctx.dirs.market) : ctx.dirs.market;
	const claude = ctx.agents.claude;
	if (claude) {
		const have = await registered(ctx, claude);
		if (have === undefined) return skipped(AGENT);
		if (have !== ours) return foreign(have);
		const removed = await ctx.sys.run([claude, "plugin", "marketplace", "remove", MARKET]);
		if (removed.code !== 0)
			return { agent: AGENT, ok: false, text: `Claude Code: ${firstLine(removed.stderr || removed.stdout)}` };
		return { agent: AGENT, ok: true, text: "Claude Code: the piebird plugins are removed." };
	}
	const file = join(ctx.dirs.claudeHome, "settings.json");
	const settings = readJson(file);
	const have = declared(settings);
	if (have === undefined) return skipped(AGENT);
	if (have !== ours) return foreign(have);
	const next = withoutMarketplace(settings, MARKET);
	if (next) writeJson(file, next);
	return { agent: AGENT, ok: true, text: "Claude's Code tab: the piebird plugins are removed." };
}
