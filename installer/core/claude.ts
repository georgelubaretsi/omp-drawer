// What the installer writes for Claude: in ~/.claude/settings.json, which the Claude Code CLI and
// Claude desktop's Code tab share, the piebird marketplace as a folder on this computer
// (`extraKnownMarketplaces`) and the plugins switched on (`enabledPlugins`), for when no Claude
// Code command is found to do it; and each program plugin's .mcpb manifest, for Claude chat.
// Claude Code rewrites settings.json itself, so it is edited, never replaced.

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function section(settings: Fields, key: string): Fields {
	const value = settings[key];
	return isFields(value) ? { ...value } : {};
}

/** settings.json with the marketplace at `folder` known and the plugins on. */
export function withMarketplace(settings: unknown, market: string, folder: string, ids: readonly string[]): Fields {
	const next: Fields = isFields(settings) ? { ...settings } : {};
	const markets = section(next, "extraKnownMarketplaces");
	markets[market] = { source: { source: "directory", path: folder } };
	const enabled = section(next, "enabledPlugins");
	for (const id of ids) enabled[id] = true;
	return { ...next, extraKnownMarketplaces: markets, enabledPlugins: enabled };
}

/** settings.json without the marketplace and the plugins from it. */
export function withoutMarketplace(settings: unknown, market: string): Fields | undefined {
	if (!isFields(settings)) return undefined;
	const next: Fields = { ...settings };
	const markets = section(next, "extraKnownMarketplaces");
	delete markets[market];
	const enabled = Object.fromEntries(
		Object.entries(section(next, "enabledPlugins")).filter(([id]) => !id.endsWith(`@${market}`)),
	);
	return { ...next, extraKnownMarketplaces: markets, enabledPlugins: enabled };
}

export interface McpbPlugin {
	readonly name: string;
	/** The name Claude shows. */
	readonly title: string;
	readonly version: string;
	readonly description: string;
}

/**
 * A program plugin's .mcpb manifest: its program as a binary MCP server. The native starter picks
 * this computer's build (the format has no key for the processor). `author.name` and `name` stay
 * the same across releases: Claude identifies a local extension by them, so a newer .mcpb replaces
 * the older one. No user_config: it has no type for a choice, so settings come from the settings
 * page and the person's settings file.
 */
export function mcpbManifest(p: McpbPlugin): Fields {
	return {
		manifest_version: "0.3",
		name: p.name,
		display_name: p.title,
		version: p.version,
		description: p.description,
		author: { name: "piebird" },
		server: {
			type: "binary",
			entry_point: `native/${p.name}`,
			mcp_config: {
				command: `\${__dirname}/native/${p.name}`,
				args: ["mcp"],
				platform_overrides: { win32: { command: `\${__dirname}/native/${p.name}.exe` } },
			},
		},
		compatibility: { platforms: ["darwin", "win32"] },
	};
}
