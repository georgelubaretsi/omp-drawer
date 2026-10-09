// This build's cross-host rules for Claude Code, and the translation of mcp.json into its .mcp.json.
import { posix } from "node:path";
import { isObject, type Json, type JsonObject, pointerToken } from "./json";
import type { CatalogEntry } from "./schemas";

// Marketplace names Claude Code refuses that pass the catalog's name rule (code.claude.com/docs/en/plugins/marketplace-reference,
// "Reserved names"); names with claude or anthropic are already excluded.
const CLAUDE_RESERVED_MARKETPLACES = [
	"agent-skills",
	"life-sciences",
	"knowledge-work-plugins",
	"financial-services-plugins",
	"first-party-plugins",
	"healthcare",
	"npm",
	"pip",
	"uv",
	"cargo",
	"github",
	"gh",
	"inline",
	"builtin",
	"skills-dir",
	"synced",
];

const DROP_CLAUDE = "or drop the claude host";
const EXPANDS = "Claude Code expands ${...} here from the user's environment, Agent Plugins hosts keep it literal";
const ONLY_OURS = `${EXPANDS}; only \${PLUGIN_ROOT} and \${PLUGIN_DATA} work on both; drop it ${DROP_CLAUDE}`;

/** The translation rewrites exactly ${PLUGIN_ROOT} and ${PLUGIN_DATA}; anything else stays for Claude Code to expand. */
function otherPlaceholder(v: Json): boolean {
	return typeof v === "string" && v.replace(/\$\{PLUGIN_(?:ROOT|DATA)\}/g, "").includes("${");
}

/** Claude Code requires author.name and a parseable homepage (claude plugin validate: "author.name: Invalid input",
 * "homepage: Invalid URL"); Agent Plugins §5.4 requires neither. */
function manifestProblems(file: string, manifest: JsonObject): string[] {
	const out: string[] = [];
	if (isObject(manifest.author) && (typeof manifest.author.name !== "string" || !/\S/.test(manifest.author.name))) {
		out.push(`${file}: /author/name is required by Claude Code; add it ${DROP_CLAUDE}`);
	}
	if (typeof manifest.homepage === "string" && !URL.canParse(manifest.homepage)) {
		out.push(
			`${file}: /homepage must be a URL for Claude Code, which refuses to load the plugin otherwise; fix it ${DROP_CLAUDE}`,
		);
	}
	return out;
}

/** cwd, args and env of server `at`. */
function stdioProblems(at: string, server: JsonObject): string[] {
	const out: string[] = [];
	if ("cwd" in server)
		out.push(`${at}/cwd Claude Code doesn't support cwd for plugin MCP servers; drop cwd ${DROP_CLAUDE}`);
	const args = Array.isArray(server.args) ? server.args : [];
	args.forEach((a, i) => {
		if (otherPlaceholder(a)) out.push(`${at}/args/${i} ${ONLY_OURS}`);
	});
	for (const [key, value] of Object.entries(isObject(server.env) ? server.env : {})) {
		if (otherPlaceholder(value)) out.push(`${at}/env/${pointerToken(key)} ${ONLY_OURS}`);
	}
	return out;
}

/** url and headers of server `at`. */
function remoteProblems(at: string, server: JsonObject): string[] {
	const out: string[] = [];
	if (typeof server.url === "string" && server.url.includes("${"))
		out.push(`${at}/url ${EXPANDS}; drop it ${DROP_CLAUDE}`);
	for (const [key, value] of Object.entries(isObject(server.headers) ? server.headers : {})) {
		if (typeof value === "string" && value.includes("${"))
			out.push(`${at}/headers/${pointerToken(key)} ${EXPANDS}; drop it ${DROP_CLAUDE}`);
	}
	return out;
}

/**
 * Where Claude Code reads the files the Claude translation emits differently from Agent Plugins
 * hosts, for a plugin with the claude host. Sources: code.claude.com/docs/en/plugins-reference
 * ("Fields"; "Environment variables": stdio `${...}` resolves in command, args and env only) and
 * code.claude.com/docs/en/mcp ("Environment variable expansion in .mcp.json": `${VAR}` from the
 * user's environment in command, args, env, url and headers). Agent Plugins keeps unknown
 * `${...}` literal and never expands url or headers (§7.2.1, §9.2).
 */
function pluginProblems(base: string, manifest: JsonObject, mcp: JsonObject | undefined): string[] {
	const out = manifestProblems(`${base}/plugin.json`, manifest);
	if (!mcp || !isObject(mcp.mcpServers)) return out;
	for (const [name, server] of Object.entries(mcp.mcpServers)) {
		if (!isObject(server)) continue;
		const at = `${base}/mcp.json: /mcpServers/${pointerToken(name)}`;
		out.push(...stdioProblems(at, server), ...remoteProblems(at, server));
	}
	return out;
}

/** Cross-host rules for what Claude Code would get: each claude plugin, and the catalog name. */
export function claudeProblems(
	catalog: JsonObject | undefined,
	entries: CatalogEntry[],
	loaded: Map<string, { manifest: JsonObject; mcp?: JsonObject }>,
): string[] {
	const out: string[] = [];
	for (const entry of entries) {
		const plugin = loaded.get(entry.name);
		if (plugin && entry.hosts.includes("claude"))
			out.push(...pluginProblems(`plugins/${entry.name}`, plugin.manifest, plugin.mcp));
	}
	const name = catalog?.name;
	if (
		typeof name === "string" &&
		entries.some(e => e.hosts.includes("claude")) &&
		CLAUDE_RESERVED_MARKETPLACES.includes(name)
	) {
		out.push(
			`catalog.json: /name "${name}" is reserved by Claude Code, which refuses to add the marketplace; rename it or drop the claude host`,
		);
	}
	return out;
}

function expandForClaude(v: Json): Json {
	return typeof v === "string" ? v.replace(/\$\{PLUGIN_(ROOT|DATA)\}/g, "${CLAUDE_PLUGIN_$1}") : v;
}

/** One server in Claude Code's shape. */
function claudeServer(raw: JsonObject): JsonObject {
	const server: JsonObject = { ...raw };
	if (server.type === "streamable-http") server.type = "http";
	if (server.type !== "stdio") return server;
	// Claude Code runs plugin servers in the project directory, so a ./ path becomes a plugin-root path.
	if (typeof server.command === "string" && server.command.startsWith("./"))
		server.command = `\${CLAUDE_PLUGIN_ROOT}/${posix.normalize(server.command)}`;
	if (Array.isArray(server.args)) server.args = server.args.map(expandForClaude);
	if (isObject(server.env)) {
		server.env = Object.fromEntries(Object.entries(server.env).map(([k, v]) => [k, expandForClaude(v)]));
	}
	return server;
}

/** Translates an Agent Plugins mcp.json into Claude Code's .mcp.json shape; claudeProblems has rejected what Claude Code can't take. */
export function claudeMcp(mcp: JsonObject): JsonObject {
	const servers: JsonObject = {};
	for (const [name, raw] of Object.entries(isObject(mcp.mcpServers) ? mcp.mcpServers : {})) {
		servers[name] = isObject(raw) ? claudeServer(raw) : raw;
	}
	return { mcpServers: servers };
}
