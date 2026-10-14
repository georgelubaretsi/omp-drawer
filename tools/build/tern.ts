// Tern parts: a plugin with the tern host keeps its Tern plugin in so.stencil.tern/, the Agent
// Plugins extension directory (§8.2) for Tern's namespace, and its omp part installs it there from
// (Tern has no marketplace). The checks: the folder exists exactly when the catalog lists the tern
// host, and its plugin.toml carries the plugin's name as its id and plugin.json's version. Tern's
// own rules for plugin.toml are checked by Tern itself (consumers.test.ts).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasExactly, kindProblem, type PluginDir } from "./paths";
import type { CatalogEntry } from "./schemas";

/** The Tern part's folder: Tern's reverse-domain namespace. */
export const TERN_DIR = "so.stencil.tern";

/** Problems with the Tern part of plugins/<entry.name>, whose plugin.json has `version`. */
async function partProblems(root: string, entry: CatalogEntry, version: unknown): Promise<string[]> {
	const out: string[] = [];
	const dir: PluginDir = { base: `plugins/${entry.name}`, path: join(root, "plugins", entry.name) };
	const has = hasExactly(await readdir(dir.path), TERN_DIR, dir.base, out);
	const wanted = entry.hosts.includes("tern");
	if (!has) {
		if (wanted) out.push(`${dir.base}/${TERN_DIR}/plugin.toml: missing; the tern host needs the plugin's Tern part`);
		return out;
	}
	if (!wanted) {
		out.push(
			`${dir.base}/${TERN_DIR}/: only a plugin with the tern host has one; add "tern" to its hosts in catalog.json`,
		);
		return out;
	}
	const folderProblem = await kindProblem(dir, TERN_DIR, "directory");
	if (folderProblem) return [...out, folderProblem];
	const part: PluginDir = { base: `${dir.base}/${TERN_DIR}`, path: join(dir.path, TERN_DIR) };
	if (!hasExactly(await readdir(part.path), "plugin.toml", part.base, out)) {
		out.push(`${part.base}/plugin.toml: missing; Tern loads a plugin from its plugin.toml`);
		return out;
	}
	const fileProblem = await kindProblem(part, "plugin.toml", "file");
	if (fileProblem) return [...out, fileProblem];
	let toml: unknown;
	try {
		toml = Bun.TOML.parse(await readFile(join(part.path, "plugin.toml"), "utf8"));
	} catch (e) {
		return [...out, `${part.base}/plugin.toml: not valid TOML: ${e instanceof Error ? e.message : String(e)}`];
	}
	const field = (key: string): unknown => (toml && typeof toml === "object" ? Reflect.get(toml, key) : undefined);
	// One name everywhere: the folder, plugin.json, the catalog and Tern's id.
	if (field("id") !== entry.name) out.push(`${part.base}/plugin.toml: id must be the plugin's name "${entry.name}"`);
	if (field("version") !== version)
		out.push(`${part.base}/plugin.toml: version must be plugin.json's ${JSON.stringify(version)}`);
	return out;
}

/** The Tern part rules for every catalog entry with a loaded plugin; `versions` maps names to plugin.json versions. */
export async function ternProblems(
	root: string,
	entries: CatalogEntry[],
	versions: ReadonlyMap<string, unknown>,
): Promise<string[]> {
	const out: string[] = [];
	for (const entry of entries) {
		if (versions.has(entry.name)) out.push(...(await partProblems(root, entry, versions.get(entry.name))));
	}
	return out;
}
