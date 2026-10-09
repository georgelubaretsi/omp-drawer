// Path rules: the one lexical containment test, exact fixed names, and the symlink ban.
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, join, posix, win32 } from "node:path";

/** One plugin folder being validated. */
export interface PluginDir {
	/** Path relative to the build root, e.g. plugins/demo. */
	base: string;
	/** Absolute path. */
	path: string;
	/** Plugin-relative paths this build generates in the folder (e.g. bin/launcher); they count as bundled. */
	generated?: ReadonlySet<string>;
}

/**
 * The one containment test for every path check: whether `rel`, as returned by path.relative
 * (or path.win32.relative), leaves its base. Outside: `..`, `..` followed by either separator, or
 * an absolute path (path.relative returns one for another drive on Windows).
 */
export function isOutside(rel: string): boolean {
	return rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel) || win32.isAbsolute(rel);
}

/** True when `rest`, normalized with `/` and `\` both taken as separators (Windows hosts do), climbs out of its root. */
export function escapesLexically(rest: string): boolean {
	return isOutside(posix.normalize(`./${rest.replaceAll("\\", "/")}`));
}

export const NODE_MODULES_PROBLEM = "must point inside the package; node_modules isn't part of it";

/**
 * Whether a plugin-relative path, as written, has a node_modules part. node_modules is an
 * untracked install that hosts never receive, and linkProblems doesn't walk it, so a path through
 * it is broken on every host and could pass a link. Checked before normalization (`node_modules/..`
 * still enters it) and in any case (case-insensitive filesystems match `Node_Modules`).
 */
export function throughNodeModules(rest: string): boolean {
	return rest.split(/[\\/]/).some(part => part.toLowerCase() === "node_modules");
}

/**
 * Whether `name` is in the directory listing `names` exactly. Each other entry equal to it ignoring
 * case is reported: a case-insensitive filesystem opens it as `name`, case-sensitive hosts don't
 * find it (fixed locations, Agent Plugins §6.1 and §7.1, match exactly).
 */
export function hasExactly(names: string[], name: string, at: string, problems: string[]): boolean {
	for (const n of names) {
		if (n !== name && n.toLowerCase() === name.toLowerCase())
			problems.push(`${at}/${n}: must be named exactly ${name}; case-sensitive filesystems won't find it`);
	}
	return names.includes(name);
}

/** §6.2: a fixed component location that is present has the expected kind. lstat: plugin sources hold no symlinks. */
export async function kindProblem(
	dir: PluginDir,
	name: string,
	kind: "file" | "directory",
): Promise<string | undefined> {
	const info = await lstat(join(dir.path, name)).catch(() => undefined);
	if (kind === "file" ? info?.isFile() : info?.isDirectory()) return undefined;
	return `${dir.base}/${name}: must be a ${kind === "file" ? "regular file" : "directory"} (Agent Plugins §6.2)`;
}

const LINK_PROBLEM = "symlinks are not allowed in plugin sources";

/**
 * This build's own rule, narrower than Agent Plugins §4.1 (which allows links that stay inside the
 * plugin): plugin sources hold no symlinks, so every containment check is lexical and nothing is
 * read or written through a link. Walks plugins/ and each plugin folder with lstat semantics
 * (Dirent types never follow links; on Windows junctions report as links), skipping node_modules/
 * inside plugin folders (throughNodeModules keeps accepted paths out of it).
 * Returns `<path>: symlinks are not allowed in plugin sources`, sorted.
 */
export async function linkProblems(root: string): Promise<string[]> {
	const out: string[] = [];
	const walk = async (rel: string): Promise<void> => {
		for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
			const child = `${rel}/${entry.name}`;
			if (entry.isSymbolicLink()) out.push(`${child}: ${LINK_PROBLEM}`);
			else if (entry.isDirectory() && !(entry.name === "node_modules" && rel !== "plugins")) await walk(child);
		}
	};
	const plugins = await lstat(join(root, "plugins")).catch(() => undefined);
	if (plugins?.isSymbolicLink()) out.push(`plugins: ${LINK_PROBLEM}`);
	else if (plugins?.isDirectory()) await walk("plugins");
	return out.toSorted();
}

/**
 * The paths the build writes or deletes, as `<path>: symlinks are not allowed in generated paths`
 * for every existing link along them. Plugin folders are already link-free; this covers the
 * catalogs at the root, so the build never writes through a link.
 */
export async function generatedLinkProblems(root: string, rels: Iterable<string>): Promise<string[]> {
	const found = new Set<string>();
	for (const rel of rels) {
		const parts = rel.split("/");
		for (let i = 1; i <= parts.length; i++) {
			const prefix = parts.slice(0, i).join("/");
			const info = await lstat(join(root, prefix)).catch(() => undefined);
			if (!info) break;
			if (info.isSymbolicLink()) found.add(`${prefix}: symlinks are not allowed in generated paths`);
		}
	}
	return [...found].toSorted();
}
