// Claude chat runs local MCP servers only: each plugin with a program gets a .mcpb of it, which the
// person opens with Claude from the page, one at a time, and adds in Claude's own window. Claude
// keeps its own copy, so removing one is done in Claude's settings.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mcpbManifest } from "../core/claude";
import { zip } from "../core/zip";
import { type Ctx, listed, type Opening, skipped, type Step } from "./context";
import { type Plugin, pluginFiles, title } from "./plugins";

const AGENT = "claude-chat";

/** The .mcpb: the manifest and the plugin's native/ folder, starters and this computer's builds. */
export function mcpbOf(ctx: Ctx, p: Plugin): Uint8Array {
	const manifest = {
		path: "manifest.json",
		mode: 0o644,
		data: new TextEncoder().encode(`${JSON.stringify(mcpbManifest({ ...p, title: title(p.name) }), null, 2)}\n`),
	};
	return zip([manifest, ...pluginFiles(ctx.payload, p.name).filter(f => f.path.startsWith("native/"))]);
}

export function claudeChatInstall(ctx: Ctx, plugins: readonly Plugin[]): Step {
	const app = ctx.agents.apps.claude;
	const withProgram = plugins.filter(p => p.program);
	if (!app || withProgram.length === 0) return skipped(AGENT);
	rmSync(ctx.dirs.mcpb, { recursive: true, force: true });
	mkdirSync(ctx.dirs.mcpb, { recursive: true });
	const opens = withProgram.map((p): Opening => {
		const file = join(ctx.dirs.mcpb, `${p.name}.mcpb`);
		writeFileSync(file, mcpbOf(ctx, p));
		return { label: `Add ${title(p.name)} to Claude`, app: "claude", file };
	});
	const which = listed(withProgram.map(p => p.name));
	return {
		agent: AGENT,
		ok: true,
		text: `Claude chat: add ${which} with the button below, then click Install in Claude's window.`,
		opens,
	};
}

export function claudeChatUninstall(ctx: Ctx, plugins: readonly Plugin[]): Step {
	if (!existsSync(ctx.dirs.mcpb)) return skipped(AGENT);
	rmSync(ctx.dirs.mcpb, { recursive: true, force: true });
	const names = plugins.filter(p => p.program).map(p => p.name);
	const them = names.length > 1 ? "them" : "it";
	return {
		agent: AGENT,
		ok: true,
		text: `Claude chat: if you added ${listed(names)}, remove ${them} in Claude's Settings, under Extensions.`,
	};
}
