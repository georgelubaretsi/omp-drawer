// Reads and validates the hand-written sources: catalog.json and every plugins/<name>/ folder. The
// checks written out here and in the modules they call cover only what the spec
// (reference/agent-plugins/1.0.0/spec.md, cited as §) leaves to prose, this build's own cross-host
// rules, and the changelog every plugin keeps (changelog.ts).
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { checkChangelog } from "./changelog";
import { claudeProblems } from "./claude";
import { isObject, type JsonObject, ValidationError } from "./json";
import { mcpProblems } from "./mcp-rules";
import { readJson } from "./parse";
import { hasExactly, kindProblem, linkProblems, type PluginDir } from "./paths";
import {
	type CatalogEntry,
	schemaProblems,
	validateCatalog,
	validateMcp,
	validateName,
	validatePlugin,
} from "./schemas";
import { checkSkills } from "./skills";
import { LAUNCHER_FILE, loadPins, PINS_FILE } from "./tools";

/** What a plugin folder holds. */
export interface PluginSources {
	manifest: JsonObject;
	/** plugin.json fields copied into catalog entries: everything but $schema and name. */
	metadata: JsonObject;
	mcp?: JsonObject;
	pkg?: JsonObject;
	/** bin/pins, when the plugin pins tools in mise.toml (tools.ts). */
	pins?: string;
}

export type Plugin = CatalogEntry & PluginSources;

export interface Sources {
	catalog: JsonObject;
	plugins: Plugin[];
}

/** This build's cross-host rules for plugin.json (AGENTS.md); `name` is the folder name. */
function manifestProblems(file: string, manifest: JsonObject, name: string, problems: string[]): void {
	// A name omp, Claude Code and Codex all accept:
	if (!validateName(manifest.name)) problems.push(...schemaProblems(file, validateName.errors, "/name"));
	if (typeof manifest.name === "string" && manifest.name !== name) {
		problems.push(`${file}: /name must equal the directory name "${name}"`);
	}
	// Every host catalog shows a version and a description.
	for (const key of ["version", "description"]) {
		const value = manifest[key];
		if (typeof value !== "string" || !/\S/.test(value))
			problems.push(`${file}: /${key} is required and must not be blank`);
	}
	// Generated manifests copy plugin.json fields as they are; host-specific data would reach every host.
	if ("extensions" in manifest) problems.push(`${file}: /extensions is not supported by this build`);
}

/** The plugin's mcp.json when present and an object, after the schema and prose checks. */
async function loadMcp(root: string, dir: PluginDir, names: string[], problems: string[]) {
	if (!hasExactly(names, "mcp.json", dir.base, problems)) return undefined;
	const mcpFile = `${dir.base}/mcp.json`;
	const entryProblem = await kindProblem(dir, "mcp.json", "file");
	if (entryProblem) {
		problems.push(entryProblem);
		return undefined;
	}
	const parsed = await readJson(root, mcpFile, problems);
	if (parsed === undefined) return undefined;
	if (!validateMcp(parsed)) problems.push(...schemaProblems(mcpFile, validateMcp.errors));
	problems.push(...(await mcpProblems(dir, mcpFile, parsed)));
	return isObject(parsed) ? parsed : undefined;
}

/** The plugin's package.json when present and an object. */
async function loadPackage(root: string, dir: PluginDir, names: string[], problems: string[]) {
	if (!hasExactly(names, "package.json", dir.base, problems)) return undefined;
	const parsed = await readJson(root, `${dir.base}/package.json`, problems);
	if (isObject(parsed)) return parsed;
	if (parsed !== undefined) problems.push(`${dir.base}/package.json: must be a JSON object`);
	return undefined;
}

/** Validates plugins/<dir>, whose listing is `names`; returns its parsed sources, or undefined when plugin.json is unusable. */
async function loadPlugin(
	root: string,
	name: string,
	names: string[],
	problems: string[],
): Promise<PluginSources | undefined> {
	const base = `plugins/${name}`;
	const dir: PluginDir = { base, path: join(root, base) };

	const manifestProblem = await kindProblem(dir, "plugin.json", "file");
	if (manifestProblem) {
		problems.push(manifestProblem);
		return undefined;
	}
	const file = `${base}/plugin.json`;
	const manifest = await readJson(root, file, problems);
	if (manifest === undefined) return undefined;
	if (!validatePlugin(manifest)) problems.push(...schemaProblems(file, validatePlugin.errors));
	if (!isObject(manifest)) return undefined;
	manifestProblems(file, manifest, name, problems);

	await checkSkills(root, dir, names, problems);
	await checkChangelog(dir, names, manifest.version, problems);
	// Before mcp.json: a server may run a file the build generates here (tools.ts), absent until it runs.
	const pins = await loadPins(dir, names, problems);
	const generated = pins === undefined ? undefined : new Set([LAUNCHER_FILE, PINS_FILE]);
	const mcp = await loadMcp(root, { ...dir, generated }, names, problems);
	const pkg = await loadPackage(root, dir, names, problems);

	const { $schema: _schema, name: _name, ...metadata } = manifest;
	return { manifest, metadata, mcp, pkg, pins };
}

/** catalog.json when it passes its schema, with its entries; problems reported otherwise. */
async function loadCatalog(root: string, problems: string[]) {
	const parsed = await readJson(root, "catalog.json", problems);
	if (parsed === undefined) return { catalog: undefined, entries: [] };
	if (!validateCatalog(parsed)) {
		problems.push(...schemaProblems("catalog.json", validateCatalog.errors));
		return { catalog: undefined, entries: [] };
	}
	return isObject(parsed) ? { catalog: parsed, entries: parsed.plugins } : { catalog: undefined, entries: [] };
}

/** The folder names under plugins/. */
async function pluginDirs(root: string): Promise<string[]> {
	const pluginsDir = join(root, "plugins");
	if (!(await lstat(pluginsDir).catch(() => undefined))?.isDirectory()) return [];
	const entries = await readdir(pluginsDir, { withFileTypes: true });
	return entries.filter(d => d.isDirectory()).map(d => d.name);
}

/** Every catalog entry is unique and has a folder; returns the listed names. */
function entryProblems(entries: CatalogEntry[], dirs: string[], problems: string[]): Set<string> {
	const listed = new Set<string>();
	entries.forEach((entry, i) => {
		if (listed.has(entry.name)) problems.push(`catalog.json: /plugins/${i}/name duplicates plugin "${entry.name}"`);
		listed.add(entry.name);
		if (!dirs.includes(entry.name))
			problems.push(`catalog.json: /plugins/${i}/name "${entry.name}" has no plugins/${entry.name}/ folder`);
	});
	return listed;
}

/** Loads each folder under plugins/; `listed` is undefined when the catalog is unusable. */
async function loadPlugins(root: string, dirs: string[], listed: Set<string> | undefined, problems: string[]) {
	const loaded = new Map<string, PluginSources>();
	for (const dir of dirs) {
		if (listed && !listed.has(dir))
			problems.push(`plugins/${dir}/: not listed in catalog.json; add an entry or remove the folder`);
		const names = await readdir(join(root, "plugins", dir));
		if (!hasExactly(names, "plugin.json", `plugins/${dir}`, problems)) {
			problems.push(`plugins/${dir}/plugin.json: missing; add it or remove the folder`);
			continue;
		}
		const plugin = await loadPlugin(root, dir, names, problems);
		if (plugin) loaded.set(dir, plugin);
	}
	return loaded;
}

/** Reads and validates every source; throws ValidationError listing all problems. */
export async function loadSources(root: string): Promise<Sources> {
	// Before anything in plugins/ is read: a tree with links stops here.
	const links = await linkProblems(root);
	if (links.length > 0) throw new ValidationError(links);
	const problems: string[] = [];
	const { catalog, entries } = await loadCatalog(root, problems);

	// Every folder under plugins/ is a plugin, matched by its exact name (not by a case-insensitive
	// filesystem lookup): it needs a catalog entry and a plugin.json, and every entry needs a folder.
	const dirs = await pluginDirs(root);
	const listed = entryProblems(entries, dirs, problems);
	const loaded = await loadPlugins(root, dirs, catalog ? listed : undefined, problems);
	problems.push(...claudeProblems(catalog, entries, loaded));

	if (problems.length > 0 || !catalog) throw new ValidationError(problems);
	const plugins: Plugin[] = [];
	for (const entry of entries) {
		const plugin = loaded.get(entry.name);
		if (plugin) plugins.push({ ...entry, ...plugin });
	}
	return { catalog, plugins };
}
