// omp: the shared copy added as a local marketplace, then each plugin installed from it, or
// upgraded (which copies it again, so a re-run at the same version still refreshes it), checked
// against `omp plugin list`. A piebird marketplace from somewhere else (a checkout) is left alone.
import { realpathSync } from "node:fs";
import { type Ctx, fieldsOf, firstLine, listed, listOf, parsed, skipped, type Step } from "./context";
import { MARKET, type Plugin } from "./plugins";

/** The plugins omp has from the piebird marketplace, by id. */
function installed(list: string): Set<string> {
	const ids = listOf(fieldsOf(parsed(list)).marketplace).map(m => fieldsOf(m).id);
	return new Set(ids.filter((id): id is string => typeof id === "string" && id.endsWith(`@${MARKET}`)));
}

/** The source omp has the piebird marketplace from, from `omp plugin marketplace list`. */
function registered(text: string): string | undefined {
	for (const line of text.split("\n")) {
		const [name, ...source] = line.trim().split(/\s+/);
		if (name === MARKET) return source.join(" ");
	}
	return undefined;
}

function foreign(have: string): string {
	return `omp has its piebird plugins from ${have}; they were left as they are`;
}

async function ensureMarket(ctx: Ctx, omp: string): Promise<string | undefined> {
	const run = (...args: string[]) => ctx.sys.run([omp, "plugin", "marketplace", ...args]);
	const have = registered((await run("list")).stdout);
	const ours = realpathSync(ctx.dirs.market);
	const ran =
		have === undefined ? await run("add", "--", ours) : have === ours ? await run("update", "--", MARKET) : undefined;
	if (!ran)
		return `${foreign(have ?? "")}. To use these instead: omp plugin marketplace remove ${MARKET}, then install again`;
	return ran.code === 0 ? undefined : firstLine(ran.stderr || ran.stdout);
}

export async function ompInstall(ctx: Ctx, plugins: readonly Plugin[]): Promise<Step> {
	const omp = ctx.agents.omp;
	if (!omp || plugins.length === 0) return skipped("omp");
	const problem = await ensureMarket(ctx, omp);
	if (problem) return { agent: "omp", ok: false, text: `omp: ${problem}` };
	const list = async () => installed((await ctx.sys.run([omp, "plugin", "list", "--json"])).stdout);
	const before = await list();
	for (const { name } of plugins) {
		const id = `${name}@${MARKET}`;
		const args = before.has(id) ? ["upgrade", "--scope", "user", "--", id] : ["install", "--", id];
		const ran = await ctx.sys.run([omp, "plugin", ...args]);
		if (ran.code !== 0)
			return {
				agent: "omp",
				ok: false,
				text: `omp: ${name} didn't install: ${firstLine(ran.stderr || ran.stdout)}`,
			};
	}
	const after = await list();
	const missing = plugins.map(p => p.name).filter(n => !after.has(`${n}@${MARKET}`));
	if (missing.length > 0)
		return { agent: "omp", ok: false, text: `omp: ${listed(missing)} isn't in omp's plugin list` };
	return {
		agent: "omp",
		ok: true,
		text: `omp: ${listed(plugins.map(p => p.name))} installed; new sessions have them.`,
	};
}

export async function ompUninstall(ctx: Ctx): Promise<Step> {
	const omp = ctx.agents.omp;
	if (!omp) return skipped("omp");
	const have = registered((await ctx.sys.run([omp, "plugin", "marketplace", "list"])).stdout);
	if (have === undefined) return skipped("omp");
	if (!ctx.sys.exists(ctx.dirs.market) || have !== realpathSync(ctx.dirs.market))
		return { agent: "omp", ok: true, text: `omp: ${foreign(have)}.` };
	const list = async () => installed((await ctx.sys.run([omp, "plugin", "list", "--json"])).stdout);
	for (const id of await list()) await ctx.sys.run([omp, "plugin", "uninstall", "--", id]);
	const left = [...(await list())];
	if (left.length > 0) return { agent: "omp", ok: false, text: `omp: ${listed(left)} is still installed` };
	const removed = await ctx.sys.run([omp, "plugin", "marketplace", "remove", "--", MARKET]);
	if (removed.code !== 0)
		return { agent: "omp", ok: false, text: `omp: ${firstLine(removed.stderr || removed.stdout)}` };
	return { agent: "omp", ok: true, text: "omp: the piebird plugins are removed." };
}
