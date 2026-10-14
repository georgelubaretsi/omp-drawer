// What an installer for one platform carries: the marketplace files and every catalog plugin's
// folder as the agents install it, with the native programs for that platform only. Tests, the
// dependencies the hosts never get, and what Claude Code writes into a plugin are left out.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { PayloadFile } from "../../installer/core/payload";

export type Platform = "macos-arm64" | "macos-x64" | "windows-x64";

export const PLATFORMS: readonly Platform[] = ["macos-arm64", "macos-x64", "windows-x64"];

/** The marketplace files at the root, beside catalog.json, that omp and Claude Code read. */
const ROOT_FILES = ["catalog.json", ".claude-plugin/marketplace.json", ".omp-plugin/marketplace.json"];

const LEFT_OUT = new Set(["node_modules", "test", "tests", ".DS_Store"]);

/** Whether a file of a plugin (its path inside the plugin, with /) goes into the platform's installer. */
export function carried(path: string, platform: Platform): boolean {
	const parts = path.split("/");
	if (parts.some(p => LEFT_OUT.has(p))) return false;
	if (path.startsWith(".claude-plugin/types/")) return false;
	if (parts[0] !== "native") return true;
	// native/<program> is the POSIX starter, native/<program>.exe Windows' build, native/<platform>/ the rest.
	if (parts.length === 2) return path.endsWith(".exe") ? platform === "windows-x64" : true;
	return parts[1] === platform;
}

function walk(dir: string, base: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
		const path = join(dir, e.name);
		if (e.isDirectory()) return LEFT_OUT.has(e.name) ? [] : walk(path, base);
		return e.isFile() ? [relative(base, path).split(sep).join("/")] : [];
	});
}

function fileAt(root: string, path: string, as: string): PayloadFile {
	const full = join(root, path);
	return { path: as, mode: lstatSync(full).mode & 0o777, data: readFileSync(full) };
}

/** The payload for `platform` from the plugins folder at `root`, whose natives are built. */
export function payloadFiles(root: string, names: readonly string[], platform: Platform): PayloadFile[] {
	const files = ROOT_FILES.map(p => fileAt(root, p, p));
	for (const name of names) {
		const dir = join(root, "plugins", name);
		const paths = walk(dir, dir)
			.filter(p => carried(p, platform))
			.toSorted();
		files.push(...paths.map(p => fileAt(dir, p, `plugins/${name}/${p}`)));
	}
	return files;
}

/** The programs a platform's payload must carry, for each plugin with one: missing ones aren't built. */
export function missingNatives(
	files: readonly PayloadFile[],
	programs: ReadonlyMap<string, readonly string[]>,
	platform: Platform,
): string[] {
	const have = new Set(files.map(f => f.path));
	return [...programs].flatMap(([plugin, names]) =>
		names
			.map(n => `plugins/${plugin}/native/${platform === "windows-x64" ? `${n}.exe` : `${platform}/${n}`}`)
			.filter(path => !have.has(path)),
	);
}
