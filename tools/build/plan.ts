// Every generated file, computed from the validated sources.
import { readFile } from "node:fs/promises";
import { claudeMcp } from "./claude";
import { type JsonObject, toJson, ValidationError } from "./json";
import { generatedLinkProblems } from "./paths";
import { type Host, HOSTS } from "./schemas";
import { loadSources, type Plugin } from "./sources";
import { LAUNCHER_FILE, LAUNCHER_TEMPLATE, PINS_FILE } from "./tools";

const CATALOG_PATHS: Record<Host, string> = {
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
function catalogDoc(host: Host, catalog: JsonObject, members: Plugin[]): JsonObject {
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

/** package.json with version and description managed; key order and other fields kept. */
function syncPackage(pkg: JsonObject, version: string, description: string): JsonObject {
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
	return out;
}

/** The files generated inside plugin `p`'s folder. */
function pluginFiles(p: Plugin, files: Map<string, string>): void {
	const base = `plugins/${p.name}`;
	if (p.hosts.includes("claude")) {
		files.set(`${base}/.claude-plugin/plugin.json`, toJson({ name: p.name, ...p.metadata }));
		if (p.mcp) files.set(`${base}/.mcp.json`, toJson(claudeMcp(p.mcp)));
	}
	// loadSources has checked that both are non-blank strings.
	const { version, description } = p.manifest;
	if (p.pkg && typeof version === "string" && typeof description === "string") {
		files.set(`${base}/package.json`, toJson(syncPackage(p.pkg, version, description)));
	}
}

/** Computes every generated file from the sources. */
export async function plan(root: string): Promise<Plan> {
	const { catalog, plugins } = await loadSources(root);
	const files = new Map<string, string>();
	const executable = new Set<string>();
	const owned: string[] = Object.values(CATALOG_PATHS);
	// loadSources rejects folders without a catalog entry, so the validated plugins are every folder.
	for (const p of plugins) {
		const base = `plugins/${p.name}`;
		owned.push(
			`${base}/.claude-plugin/plugin.json`,
			`${base}/.mcp.json`,
			`${base}/${LAUNCHER_FILE}`,
			`${base}/${PINS_FILE}`,
		);
	}

	for (const host of HOSTS) {
		const members = plugins.filter(p => p.hosts.includes(host));
		if (members.length > 0) files.set(CATALOG_PATHS[host], toJson(catalogDoc(host, catalog, members)));
	}
	for (const p of plugins) pluginFiles(p, files);
	// Pinned tools (tools.ts): the launcher template as it is, and the pins it reads.
	const launcher = await readFile(LAUNCHER_TEMPLATE, "utf8");
	for (const p of plugins) {
		if (!p.pins) continue;
		files.set(`plugins/${p.name}/${LAUNCHER_FILE}`, launcher);
		files.set(`plugins/${p.name}/${PINS_FILE}`, p.pins);
		executable.add(`plugins/${p.name}/${LAUNCHER_FILE}`);
	}

	const links = await generatedLinkProblems(root, [...files.keys(), ...owned]);
	if (links.length > 0) throw new ValidationError(links);
	return { files, owned, executable };
}
