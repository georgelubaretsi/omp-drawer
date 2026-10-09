// mcp.json rules the schema leaves to the Agent Plugins spec prose (reference/agent-plugins/1.0.0/spec.md, cited as §).
import { lstat } from "node:fs/promises";
import { join, posix } from "node:path";
import { isObject, type JsonObject, pointerToken } from "./json";
import { escapesLexically, NODE_MODULES_PROBLEM, type PluginDir, throughNodeModules } from "./paths";
import { validateServer } from "./schemas";

// RFC 9110 §5.1 field name (token) and §5.5 field value.
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HEADER_VALUE_RE = /^(?:[\x21-\x7e\x80-\xff](?:[\t\x20-\x7e\x80-\xff]*[\x21-\x7e\x80-\xff])?)?$/;
const IPV4_LOOPBACK_RE = /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const ROOT_ESCAPE = "must stay inside the plugin root after normalization (Agent Plugins §4.1, §7.2.1)";

/**
 * §7.2.1 stdio `command`: one token, a bare name or a ./ path; never placeholder-expanded (§9.2).
 * One token, not one word: a ./ path may hold spaces when it names a bundled file. A bare name
 * with whitespace is almost always a shell string ("uvx mcp-server") and is refused as one.
 * A ./ path stays inside the plugin after normalization (§4.1) and names a bundled file, or one
 * this build generates there (a clean checkout doesn't have it yet). Checked lexically: plugin
 * sources hold no symlinks (see linkProblems).
 */
async function commandProblem(dir: PluginDir, command: string): Promise<string | undefined> {
	if (command.includes("${"))
		return "must not contain placeholders; hosts never expand command (Agent Plugins §7.2.1, §9.2)";
	const path = /[/\\]/.test(command);
	const spaced = /\s/.test(command);
	if (!path) return spaced ? "must be one executable token, not a shell command (Agent Plugins §7.2.1)" : undefined;
	if (!command.startsWith("./"))
		return "must be a bare executable name or a path starting with ./ (Agent Plugins §7.2.1)";
	if (escapesLexically(command)) return ROOT_ESCAPE;
	if (throughNodeModules(command)) return NODE_MODULES_PROBLEM;
	if (dir.generated?.has(posix.normalize(command))) return undefined;
	if ((await lstat(join(dir.path, command)).catch(() => undefined))?.isFile()) return undefined;
	const hint = spaced ? "; arguments go in args" : "";
	return `must name a file bundled in the plugin${hint} (Agent Plugins §7.2.1)`;
}

/**
 * §7.2.1 stdio `cwd`: the schema pattern checks the form (./…, ${PLUGIN_ROOT}[/…],
 * ${PLUGIN_DATA}[/…]); this checks, lexically, that it stays inside that root, and that a
 * plugin-root path stays out of node_modules. ${PLUGIN_DATA} is the host's own folder, where
 * installed dependencies belong (§9.1).
 */
function cwdProblem(cwd: string): string | undefined {
	const form = /^(?:\.\/|\$\{PLUGIN_(ROOT|DATA)\}(?:\/|$))(.*)$/s.exec(cwd);
	if (!form) return undefined;
	const [, base, rest] = form;
	if (escapesLexically(rest))
		return base === "DATA"
			? "must stay inside ${PLUGIN_DATA} after normalization (Agent Plugins §7.2.1)"
			: ROOT_ESCAPE;
	if (base !== "DATA" && throughNodeModules(rest)) return NODE_MODULES_PROBLEM;
	return undefined;
}

/** Whether `s` holds whitespace, a C0 control or DEL. */
function hasSpaceOrControl(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c < 0x20 || c === 0x7f) return true;
	}
	return /\s/.test(s);
}

/**
 * §7.2.1 remote `url`: absolute http or https, no user information, no fragment; plain http only
 * when the host is exactly `localhost` or a loopback IP literal. Judged on the text as written,
 * not on a URL parser's normalized form.
 */
function urlProblem(url: string): string | undefined {
	const written = /^(https?):\/\/([^/?#]*)/i.exec(url);
	if (!written || hasSpaceOrControl(url) || !URL.canParse(url))
		return "must be an absolute http:// or https:// URL (Agent Plugins §7.2.1)";
	const authority = written[2];
	if (authority.includes("@")) return "must not contain user information (Agent Plugins §7.2.1)";
	if (url.includes("#")) return "must not contain a fragment (Agent Plugins §7.2.1)";
	if (written[1].toLowerCase() === "https") return undefined;
	const host = authority.replace(/:\d*$/, "");
	const loopback =
		host === "localhost" ||
		IPV4_LOOPBACK_RE.test(host) ||
		(host.startsWith("[") && new URL(url).hostname === "[::1]");
	return loopback
		? undefined
		: "must use https unless the host is localhost or a loopback IP literal (Agent Plugins §7.2.1)";
}

/** §7.2.1 `headers`: valid HTTP field names and values; one entry per case-insensitive name. */
function headerProblems(at: string, headers: JsonObject): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const [name, value] of Object.entries(headers)) {
		const path = `${at}/${pointerToken(name)}`;
		if (!HEADER_NAME_RE.test(name))
			out.push(`${path} name must be an HTTP field name (Agent Plugins §7.2.1, RFC 9110 §5.1)`);
		if (typeof value === "string" && !HEADER_VALUE_RE.test(value))
			out.push(`${path} must be an HTTP field value (Agent Plugins §7.2.1, RFC 9110 §5.5)`);
		if (seen.has(name.toLowerCase()))
			out.push(`${path} repeats a header name in different case (Agent Plugins §7.2.1)`);
		seen.add(name.toLowerCase());
	}
	return out;
}

/** §7.2.1 stdio server `at`: command and cwd. */
async function stdioProblems(dir: PluginDir, at: string, server: JsonObject): Promise<string[]> {
	const out: string[] = [];
	const command = typeof server.command === "string" ? await commandProblem(dir, server.command) : undefined;
	if (command) out.push(`${at}/command ${command}`);
	const cwd = typeof server.cwd === "string" ? cwdProblem(server.cwd) : undefined;
	if (cwd) out.push(`${at}/cwd ${cwd}`);
	return out;
}

/** §7.2.1 streamable-http or sse server `at`: url and headers. */
function remoteProblems(at: string, server: JsonObject): string[] {
	const out: string[] = [];
	const url = typeof server.url === "string" ? urlProblem(server.url) : undefined;
	if (url) out.push(`${at}/url ${url}`);
	if (isObject(server.headers)) out.push(...headerProblems(`${at}/headers`, server.headers));
	return out;
}

/** Rules the mcp.json schema leaves to the spec prose, for each server the schema accepts (the schema reports the rest). */
export async function mcpProblems(dir: PluginDir, file: string, mcp: unknown): Promise<string[]> {
	if (!isObject(mcp) || !isObject(mcp.mcpServers)) return [];
	const out: string[] = [];
	for (const [name, server] of Object.entries(mcp.mcpServers)) {
		if (!validateServer(server) || !isObject(server)) continue;
		const at = `/mcpServers/${pointerToken(name)}`;
		let found: string[] = [];
		if (server.type === "stdio") found = await stdioProblems(dir, at, server);
		else if (server.type === "streamable-http" || server.type === "sse") found = remoteProblems(at, server);
		out.push(...found.map(p => `${file}: ${p}`));
	}
	return out;
}
