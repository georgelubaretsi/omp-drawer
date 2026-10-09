// Compares the generated files with the plan (check) or brings them in line with it (build).
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { isOutside } from "./paths";
import { plan } from "./plan";

async function readIfExists(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return undefined;
	}
}

/** Whether the owner may execute `path`. */
async function isExecutable(path: string): Promise<boolean> {
	return ((await stat(path)).mode & 0o100) !== 0;
}

/** Lists drift as "missing: …", "differs: …", "not executable: …" and "unexpected: …"; empty when up to date. */
export async function check(root: string): Promise<string[]> {
	const { files, owned, executable } = await plan(root);
	const drift: string[] = [];
	for (const [rel, content] of files) {
		const current = await readIfExists(join(root, rel));
		if (current === undefined) drift.push(`missing: ${rel}`);
		else if (current !== content) drift.push(`differs: ${rel}`);
		else if (executable.has(rel) && !(await isExecutable(join(root, rel)))) drift.push(`not executable: ${rel}`);
	}
	for (const rel of owned) {
		if (!files.has(rel) && existsSync(join(root, rel))) drift.push(`unexpected: ${rel}`);
	}
	return drift;
}

/** Deletes `path` and the directories that leaves empty, up to the root. */
async function remove(root: string, path: string): Promise<void> {
	await rm(path);
	for (let dir = dirname(path); ; dir = dirname(dir)) {
		const fromRoot = relative(root, dir);
		if (fromRoot === "" || isOutside(fromRoot) || (await readdir(dir)).length > 0) break;
		await rmdir(dir);
	}
}

/** Writes `content` to `path` unless it holds it already, executable when `exec`; whether anything changed. */
async function update(path: string, content: string, exec: boolean): Promise<boolean> {
	const same = (await readIfExists(path)) === content;
	if (same && (!exec || (await isExecutable(path)))) return false;
	if (!same) {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content);
	}
	if (exec) await chmod(path, 0o755);
	return true;
}

/** Writes changed generated files and deletes stale ones; returns what changed. */
export async function build(root: string): Promise<string[]> {
	const { files, owned, executable } = await plan(root);
	const changed: string[] = [];
	for (const [rel, content] of files) {
		if (await update(join(root, rel), content, executable.has(rel))) changed.push(`wrote: ${rel}`);
	}
	for (const rel of owned) {
		const path = join(root, rel);
		if (files.has(rel) || !existsSync(path)) continue;
		await remove(root, path);
		changed.push(`deleted: ${rel}`);
	}
	return changed;
}
