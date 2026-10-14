// Every generated file, computed from the validated sources.
import { join } from "node:path";
import { claudeMcp } from "./claude";
import { HOST_PARTS, hooksFile } from "./host-parts";
import { isObject, type JsonObject, toJson, ValidationError } from "./json";
import { filesUnder, kitFiles, modSnippetProblems } from "./kit";
import { modelFiles } from "./model";
import { operationProblems, operationsFiles } from "./operations";
import { generatedLinkProblems } from "./paths";
import { brandProblems, ompImportProblems, purityProblems } from "./purity";
import { type Host, MARKET_HOSTS, type MarketHost } from "./schemas";
import {
	claudeUserConfig,
	ompSettings,
	SETTINGS_FILE_SCHEMA,
	type Setting,
	settingsFileSchema,
	settingsFiles,
} from "./settings";
import { loadSources, type Plugin } from "./sources";
import { vendorFiles } from "./vendor";

const CATALOG_PATHS: Record<MarketHost, string> = {
	omp: ".omp-plugin/marketplace.json",
	claude: ".claude-plugin/marketplace.json",
	codex: ".agents/plugins/marketplace.json",
};

export interface Plan {
	/** Relative path → exact expected content. */
	files: Map<string, string>;
	/** Relative paths this tool owns that must not exist unless listed in `files`. */
	owned: string[];
	/** Paths in `files` that must be executable. */
	executable: Set<string>;
}

/** The marketplace `host` reads, listing `members`. */
function catalogDoc(host: MarketHost, catalog: JsonObject, members: Plugin[]): JsonObject {
	if (host === "codex") {
		return {
			name: catalog.name,
			// The entry fields Codex documents (developers.openai.com/plugins/build/plugins,
			// "Marketplace metadata"); Codex reads the rest from plugin.json.
			plugins: members.map(p => ({
				name: p.name,
				source: { source: "local", path: `./plugins/${p.name}` },
				policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
				category: p.category,
			})),
		};
	}
	return {
		name: catalog.name,
		owner: catalog.owner,
		metadata: { description: catalog.description },
		plugins: members.map(p => {
			// Claude Code: the generated .claude-plugin/plugin.json sets `version` and wins over the
			// entry's (code.claude.com/docs/en/plugins/marketplace-reference, "Plugin entries").
			const { version: _version, ...display } = p.metadata;
			return {
				name: p.name,
				source: `./plugins/${p.name}`,
				...(host === "claude" ? display : p.metadata),
				category: p.category,
			};
		}),
	};
}

/**
 * package.json with version and description managed, and omp's settings declaration (`omp.settings`)
 * written from the plugin's settings; key order and other fields kept.
 */
function syncPackage(
	pkg: JsonObject,
	manifest: { version: string; description: string },
	settings: Setting[],
): JsonObject {
	const { version, description } = manifest;
	const hasVersion = "version" in pkg;
	const hasDescription = "description" in pkg;
	// A missing version goes after name, a missing description after version.
	const descriptionAnchor = hasVersion ? "version" : "name";
	const out: JsonObject = {};
	for (const [key, value] of Object.entries(pkg)) {
		out[key] = key === "version" ? version : key === "description" ? description : value;
		if (key === "name" && !hasVersion) out.version = version;
		if (key === descriptionAnchor && !hasDescription) out.description = description;
	}
	if (!("version" in out)) out.version = version;
	if (!("description" in out)) out.description = description;
	if (isObject(out.omp)) out.omp = withOmpSettings(out.omp, settings);
	return out;
}

/** package.json's `omp` field with `settings` written from the plugin's settings, or none without any. */
function withOmpSettings(omp: JsonObject, settings: Setting[]): JsonObject {
	const { settings: _old, ...rest } = omp;
	return settings.length > 0 ? { ...rest, settings: ompSettings(settings) } : rest;
}

/** The files generated inside plugin `p`'s folder. */
function pluginFiles(p: Plugin, files: Map<string, string>): void {
	const base = `plugins/${p.name}`;
	// A part still in development is built and tested, but no manifest declares it yet.
	const part = (host: Host) => p.parts.find(found => found.host === host && !p.development?.includes(host));
	if (p.hosts.includes("claude")) {
		const manifest: JsonObject = { name: p.name, ...p.metadata };
		const claude = part("claude");
		if (claude) manifest.hooks = hooksFile(claude);
		if (p.settings.length > 0) manifest.userConfig = claudeUserConfig(p.settings);
		files.set(`${base}/.claude-plugin/plugin.json`, toJson(manifest));
		if (p.mcp) files.set(`${base}/.mcp.json`, toJson(claudeMcp(p.mcp)));
	}
	// Codex reads this beside plugin.json for what Agent Plugins lacks: here, only the hooks file.
	const codex = part("codex");
	if (codex) files.set(`${base}/${codex.manifest}`, toJson({ name: p.name, hooks: hooksFile(codex) }));
	// loadSources has checked that both are non-blank strings.
	const { version, description } = p.manifest;
	if (p.pkg && typeof version === "string" && typeof description === "string") {
		files.set(`${base}/package.json`, toJson(syncPackage(p.pkg, { version, description }, p.settings)));
	}
}

/** Computes every generated file from the sources. */
export async function plan(root: string): Promise<Plan> {
	const { catalog, plugins } = await loadSources(root);
	const problems = [
		...(await purityProblems(root, plugins)),
		...(await ompImportProblems(root, plugins)),
		...(await brandProblems(root, plugins)),
		...(await operationProblems(root, plugins)),
		...(await modSnippetProblems(root, plugins)),
	];
	if (problems.length > 0) throw new ValidationError(problems);
	const files = new Map<string, string>();
	const executable = new Set<string>();
	const owned: string[] = [...Object.values(CATALOG_PATHS), SETTINGS_FILE_SCHEMA];
	// loadSources rejects folders without a catalog entry, so the validated plugins are every folder.
	for (const p of plugins) {
		const base = `plugins/${p.name}`;
		owned.push(`${base}/.mcp.json`, ...HOST_PARTS.map(part => `${base}/${part.manifest}`));
	}

	for (const host of MARKET_HOSTS) {
		const members = plugins.filter(p => p.hosts.includes(host));
		if (members.length > 0) files.set(CATALOG_PATHS[host], toJson(catalogDoc(host, catalog, members)));
	}
	for (const p of plugins) pluginFiles(p, files);
	if (plugins.some(p => p.settings.length > 0)) files.set(SETTINGS_FILE_SCHEMA, toJson(settingsFileSchema(plugins)));
	const vendored = await vendorFiles(root);
	for (const [path, content] of vendored.files) files.set(path, content);
	for (const dir of vendored.dirs) owned.push(...(await filesUnder(join(root, dir))).map(f => `${dir}/${f}`));
	await kitFiles(root, plugins, files, owned);
	await modelFiles(root, plugins, files, owned);
	await operationsFiles(root, plugins, files, owned);
	await settingsFiles(root, plugins, files, owned);

	const links = await generatedLinkProblems(root, [...files.keys(), ...owned]);
	if (links.length > 0) throw new ValidationError(links);
	return { files, owned, executable };
}
