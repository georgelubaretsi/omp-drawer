// Pinned external tools: a plugin that needs a prebuilt binary names it in a hand-written mise.toml
// (`"github:<owner>/<repo>" = { version, filter_bins }`) and keeps the mise.lock that `mise lock`
// writes for it, with the URL and sha256 of each platform's build. From these the build writes
// bin/pins, which bin/launcher (a copy of ../launcher/launcher.sh) reads to find or download
// exactly that build.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isObject, type JsonObject } from "./json";
import { hasExactly, type PluginDir } from "./paths";

/** The platforms every pin covers, as mise names them. */
export const PLATFORMS = ["macos-arm64", "macos-x64", "linux-x64", "linux-arm64"];
export const LOCK_COMMAND = `mise lock --platform ${PLATFORMS.join(",")}`;
const REFRESH = `run \`${LOCK_COMMAND}\` in its folder from the dev shell`;
/** The launcher template the build copies into bin/launcher. */
export const LAUNCHER_TEMPLATE = join(import.meta.dir, "../launcher/launcher.sh");
export const PINS_HEADER = "# Generated from mise.lock by tools/build; do not edit.";
/** What the build generates in a plugin folder with pins, relative to it. */
export const LAUNCHER_FILE = "bin/launcher";
export const PINS_FILE = "bin/pins";

// An executable name is also a file name and, uppercased, part of an environment variable name.
const EXE_NAME = /^[A-Za-z][A-Za-z0-9._-]*$/;
const SHA256 = /^sha256:([0-9a-f]{64})$/;
// bin/pins is tab-separated, one pin per line.
const SPACE_OR_CONTROL = /[\s\p{Cc}]/u;

/**
 * The archive forms the launcher unpacks, matched as it matches them: case-sensitively, at the end
 * of the URL (the `case $url` in ../launcher/launcher.sh lists the same; launcher.test.ts runs each).
 * Any other URL is taken as the binary itself.
 */
export const ARCHIVE_SUFFIXES = [".tar.gz", ".tgz", ".tar.xz", ".zip"];
// Packed forms, in any case: a URL ending in one that isn't an ARCHIVE_SUFFIXES match exactly
// would be run as the binary while it is an archive or a package.
const PACKED = /\.(?:tar|t?gz|tbz2?|bz2|t?zst|txz|xz|lz|lzma|lz4|z|zip|7z|rar|dmg|pkg|deb|rpm|msi|appimage)$/i;

/** The TOML file `name` in plugin `dir`, parsed with Bun's parser; undefined, with the problem reported, when it doesn't parse. */
async function readToml(dir: PluginDir, name: string, problems: string[]): Promise<JsonObject | undefined> {
	const rel = `${dir.base}/${name}`;
	let parsed: unknown;
	try {
		parsed = Bun.TOML.parse(await readFile(join(dir.path, name), "utf8"));
	} catch (e) {
		problems.push(`${rel}: invalid TOML: ${e instanceof Error ? e.message : String(e)}`);
		return undefined;
	}
	return isObject(parsed) ? parsed : undefined;
}

interface Tool {
	key: string;
	version: string;
	exes: string[];
}

/** The tool `key` of mise.toml as the launcher needs it: a github backend, a version and executable names. */
function readTool(file: string, key: string, spec: unknown, problems: string[]): Tool | undefined {
	const at = `${file}: tools.${JSON.stringify(key)}:`;
	if (!key.startsWith("github:")) {
		problems.push(
			`${at} only the github: backend is supported; npm and Python tools need a strict lockfile install, not supported yet`,
		);
		return undefined;
	}
	const { version, filter_bins: bins } = isObject(spec) ? spec : {};
	const before = problems.length;
	if (typeof version !== "string" || version.trim() === "") problems.push(`${at} version is required`);
	else if (SPACE_OR_CONTROL.test(version))
		problems.push(`${at} version must not contain whitespace or control characters`);
	if (typeof bins !== "string") problems.push(`${at} filter_bins is required (the executable names, comma-separated)`);
	const exes = typeof bins === "string" ? bins.split(",").map(s => s.trim()) : [];
	for (const exe of exes) {
		if (!EXE_NAME.test(exe)) problems.push(`${at} filter_bins: ${JSON.stringify(exe)} is not an executable name`);
	}
	if (problems.length > before || typeof version !== "string") return undefined;
	return { key, version, exes };
}

/** Why the launcher couldn't download and unpack `url` correctly; undefined when it can. */
function urlProblem(url: unknown): string | undefined {
	if (typeof url !== "string" || !url.startsWith("https://")) return "url must be an https URL";
	if (SPACE_OR_CONTROL.test(url)) return "url must not contain whitespace or control characters";
	// The launcher picks how to unpack by the URL's ending.
	if (/[?#]/.test(url)) return "url must not have a query or fragment";
	if (ARCHIVE_SUFFIXES.some(s => url.endsWith(s)) || !PACKED.test(url)) return undefined;
	const name = url.slice(url.lastIndexOf("/") + 1);
	return `url names ${name}, which the launcher can't unpack; it takes ${ARCHIVE_SUFFIXES.join(", ")} or a bare binary`;
}

/** One platform's `build` from mise.lock, located `at`: a URL the launcher can use and the sha256 in hex. */
function platformBuild(at: string, build: JsonObject, problems: string[]) {
	const { url, checksum } = build;
	const sum = typeof checksum === "string" ? SHA256.exec(checksum)?.[1] : undefined;
	const problem = urlProblem(url);
	if (problem) problems.push(`${at}: ${problem}`);
	if (!sum) problems.push(`${at}: checksum must be "sha256:" and 64 lowercase hex digits`);
	return typeof url === "string" && !problem && sum ? { url, sum } : undefined;
}

/** Records `tool` in `owners` as the tool of each of its executables; one another tool has already is a problem. */
function claimExes(file: string, tool: Tool, owners: Map<string, string>, problems: string[]): void {
	for (const exe of tool.exes) {
		const other = owners.get(exe);
		if (other === undefined) owners.set(exe, tool.key);
		else if (other !== tool.key)
			problems.push(
				`${file}: filter_bins: ${JSON.stringify(exe)} is in both tools.${JSON.stringify(other)} and tools.${JSON.stringify(tool.key)}; the launcher runs one pinned build per executable name`,
			);
	}
}

/** The pins lines for `tool` from its mise.lock entries `locked`. */
function lockedLines(file: string, tool: Tool, locked: unknown, problems: string[]): string[] {
	const entries: unknown[] = Array.isArray(locked) ? locked : [];
	const entry = entries.find(e => isObject(e) && e.version === tool.version);
	if (!isObject(entry)) {
		problems.push(
			`${file}: no ${JSON.stringify(tool.key)} entry for version ${tool.version} (mise.toml's); ${REFRESH}`,
		);
		return [];
	}
	const lines: string[] = [];
	for (const platform of PLATFORMS) {
		const at = `${file}: ${JSON.stringify(tool.key)} ${tool.version} platforms.${platform}`;
		const build = entry[`platforms.${platform}`];
		if (!isObject(build)) {
			problems.push(`${at} is missing; ${REFRESH}`);
			continue;
		}
		const pin = platformBuild(at, build, problems);
		if (!pin) continue;
		for (const exe of tool.exes) lines.push([exe, tool.version, platform, pin.url, pin.sum].join("\t"));
	}
	return lines;
}

/** mise.toml's [tools] and mise.lock's tools, when both read without problems (which are reported). */
async function readPinFiles(dir: PluginDir, hasLock: boolean, problems: string[]) {
	const before = problems.length;
	const toml = await readToml(dir, "mise.toml", problems);
	const specs = toml?.tools;
	if (toml && (!isObject(specs) || Object.keys(specs).length === 0))
		problems.push(`${dir.base}/mise.toml: [tools] must list at least one tool`);
	if (!hasLock) problems.push(`${dir.base}/mise.lock: missing; ${REFRESH}`);
	const locked = hasLock ? (await readToml(dir, "mise.lock", problems))?.tools : undefined;
	if (problems.length > before || !isObject(specs)) return undefined;
	return { specs, locked: isObject(locked) ? locked : {} };
}

/**
 * Plugin `dir`'s bin/pins content when it has a mise.toml (its listing is `names`), after checking
 * mise.toml and mise.lock; undefined when it has none or they have problems, which are reported.
 */
export async function loadPins(dir: PluginDir, names: string[], problems: string[]): Promise<string | undefined> {
	const hasToml = hasExactly(names, "mise.toml", dir.base, problems);
	const hasLock = hasExactly(names, "mise.lock", dir.base, problems);
	if (!hasToml) {
		if (hasLock)
			problems.push(`${dir.base}/mise.lock: there is no mise.toml next to it; add one or remove mise.lock`);
		return undefined;
	}
	const read = await readPinFiles(dir, hasLock, problems);
	if (!read) return undefined;
	const before = problems.length;
	const owners = new Map<string, string>();
	const lines: string[] = [];
	for (const [key, spec] of Object.entries(read.specs)) {
		const tool = readTool(`${dir.base}/mise.toml`, key, spec, problems);
		if (!tool) continue;
		claimExes(`${dir.base}/mise.toml`, tool, owners, problems);
		lines.push(...lockedLines(`${dir.base}/mise.lock`, tool, read.locked[key], problems));
	}
	return problems.length > before ? undefined : `${PINS_HEADER}\n${lines.map(l => `${l}\n`).join("")}`;
}
