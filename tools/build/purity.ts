// What code may import, and write. Core code stays pure, so a relative import is the one way it
// could reach a shell: each must land in the plugin's core/ or its kit/core/ copy (what a core
// file may use itself is oxlint's, .oxlintrc.json's core override; it can't follow a relative path
// to where it leads). An omp extension gets no packages of its own: omp installs a marketplace
// plugin as its folder alone, so by name it may import only what omp and its runtime give every
// extension. And text for the model comes from a catalog: only kit/core/model.ts writes the brand
// that makes an object a ModelText.
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path/posix";
import { filesUnder, KIT } from "./kit";

/** Every script Bun loads: TypeScript and JavaScript, as modules or CommonJS, with JSX or without. */
const SCANNED = /\.[cm]?[jt]sx?$/;
const EXEMPT = /\.(test|d)\.[cm]?tsx?$/;
const scanners = { ts: new Bun.Transpiler({ loader: "ts" }), tsx: new Bun.Transpiler({ loader: "tsx" }) };

/** Every import of each code file under `dir` (tests and declarations aside), as `visit(file, path)`. */
async function eachImport(root: string, dir: string, visit: (file: string, path: string) => void): Promise<void> {
	for (const f of await filesUnder(join(root, dir))) {
		if (!SCANNED.test(f) || EXEMPT.test(f)) continue;
		const file = `${dir}/${f}`;
		const scanner = f.endsWith("x") ? scanners.tsx : scanners.ts;
		for (const { path } of scanner.scanImports(await readFile(join(root, file), "utf8"))) visit(file, path);
	}
}

/** Each pure folder, with where its files may import from. */
function pureFolders(plugins: readonly { name: string }[]): { dir: string; allowed: string[] }[] {
	return [
		{ dir: `${KIT}/core`, allowed: [`${KIT}/core`] },
		...plugins.map(p => ({
			dir: `plugins/${p.name}/core`,
			allowed: [`plugins/${p.name}/core`, `plugins/${p.name}/${KIT}/core`],
		})),
	];
}

export async function purityProblems(root: string, plugins: readonly { name: string }[]): Promise<string[]> {
	const problems: string[] = [];
	for (const { dir, allowed } of pureFolders(plugins)) {
		await eachImport(root, dir, (file, path) => {
			if (!path.startsWith(".")) return;
			const target = normalize(join(dirname(file), path));
			if (!allowed.some(a => target.startsWith(`${a}/`))) {
				problems.push(`${file}: imports ${path}, outside ${allowed.join(" and ")}; core code stays pure`);
			}
		});
	}
	return problems;
}

/** What omp gives every extension to import by name: its own packages, and Bun's and Node's built-ins. */
const OMP_GIVES = /^(@oh-my-pi\/|node:|bun$|bun:)/;

/** The kit parts an omp extension carries, and each plugin's extension. */
function ompFolders(plugins: readonly { name: string }[]): string[] {
	return [`${KIT}/core`, `${KIT}/bun`, `${KIT}/omp`, ...plugins.map(p => `plugins/${p.name}/src`)];
}

export async function ompImportProblems(root: string, plugins: readonly { name: string }[]): Promise<string[]> {
	const problems: string[] = [];
	for (const dir of ompFolders(plugins)) {
		await eachImport(root, dir, (file, path) => {
			if (path.startsWith(".") || OMP_GIVES.test(path)) return;
			problems.push(
				`${file}: imports ${path}, which omp doesn't install with the plugin; carry it (the plugin's vendor.json) or use Bun's own`,
			);
		});
	}
	return problems;
}

const BRAND = "piebird-catalog";
/** Where the brand may be written: the kit's ModelText, and each plugin's generated copy of it. */
const BRAND_HOME = /^(plugins\/[^/]+\/)?kit\/core\/model\.ts$/;
const NOT_OURS = /(^|\/)(node_modules|vendor)\//;

export async function brandProblems(root: string, plugins: readonly { name: string }[]): Promise<string[]> {
	const problems: string[] = [];
	for (const dir of [KIT, ...plugins.map(p => `plugins/${p.name}`)]) {
		for (const f of await filesUnder(join(root, dir))) {
			const file = `${dir}/${f}`;
			if (!SCANNED.test(f) || BRAND_HOME.test(file) || NOT_OURS.test(file)) continue;
			if ((await readFile(join(root, file), "utf8")).includes(BRAND))
				problems.push(`${file}: writes ModelText's brand; text for the model comes from the plugin's catalog`);
		}
	}
	return problems;
}
