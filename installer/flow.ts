// Installing and removing, agent by agent: one agent's failure is reported and the others go on.
import { rmSync } from "node:fs";
import { claudeChatInstall, claudeChatUninstall } from "./steps/claude-chat";
import { claudeInstall, claudeUninstall } from "./steps/claude";
import { codexInstall, codexUninstall } from "./steps/codex";
import type { Ctx, Step } from "./steps/context";
import { replaceFolder } from "./steps/files";
import { ompInstall, ompUninstall } from "./steps/omp";
import type { Plugin } from "./steps/plugins";

async function guarded(agent: string, step: () => Step | Promise<Step>): Promise<Step> {
	try {
		return await step();
	} catch (error) {
		return { agent, ok: false, text: `${agent}: ${error instanceof Error ? error.message : String(error)}` };
	}
}

/** Installs the named plugins in every agent here that takes them. */
export async function install(ctx: Ctx, names: readonly string[]): Promise<Step[]> {
	const chosen = ctx.plugins.filter(p => names.includes(p.name));
	const forHost = (host: string): Plugin[] => chosen.filter(p => p.hosts.includes(host));
	// The shared copy, which omp and Claude Code install from and the vaults sign in from.
	const shared = await guarded("piebird", () => {
		replaceFolder(ctx.dirs.market, ctx.payload);
		return { agent: "piebird", ok: true, text: "" };
	});
	if (!shared.ok) return [shared];
	return [
		await guarded("omp", () => ompInstall(ctx, forHost("omp"))),
		await guarded("claude", () => claudeInstall(ctx, forHost("claude"))),
		await guarded("claude-chat", () => claudeChatInstall(ctx, forHost("claude"))),
		await guarded("codex", () => codexInstall(ctx, forHost("codex"))),
	];
}

/** Removes every piebird plugin this installer put in place; the piebird settings files and sign-ins stay. */
export async function uninstall(ctx: Ctx): Promise<Step[]> {
	const steps = [
		await guarded("omp", () => ompUninstall(ctx)),
		await guarded("claude", () => claudeUninstall(ctx)),
		await guarded("claude-chat", () => claudeChatUninstall(ctx, ctx.plugins)),
		await guarded("codex", () => codexUninstall(ctx)),
	];
	// omp's and Claude Code's records point at the shared copy; it goes only once they're gone.
	if (steps.every(s => s.ok)) rmSync(ctx.dirs.market, { recursive: true, force: true });
	return steps;
}
