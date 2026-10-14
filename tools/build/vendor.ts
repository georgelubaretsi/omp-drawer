// Libraries carried as copies, since a plugin gets none of its packages installed: a Claude Code
// mod can import only files in its plugin, and omp installs a marketplace plugin's folder alone.
// kit/vendor.json declares the kit's, which go with the kit into each plugin using that part;
// plugins/<name>/vendor.json a plugin's own, under that plugin. Each is copied from the build's own
// pinned package: `from`'s modules and `types`' declarations (both folders, nested ones included),
// with the package's LICENSE, or kit/licenses/<SPDX id>.txt when it ships none.
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { isObject, ValidationError } from "./json";
import { filesUnder } from "./kit";
import { readJson } from "./parse";
import { escapesLexically } from "./paths";

const PACKAGES = join(import.meta.dir, "..", "..", "node_modules");
const KIT_DECLARED = "kit/vendor.json";

interface Vendored {
	name: string;
	from: string;
	types?: string;
	to: string;
	license: string;
}

/** `rel` with `/` for either separator (Windows takes both), normalized. */
function slashed(rel: string): string {
	return posix.normalize(rel.replaceAll("\\", "/"));
}

/**
 * Why a declaration's paths aren't safe (paths.ts's lexical test): its sources leave the package,
 * or its copy isn't a folder under a vendor/ folder, the only folders the build may write and
 * delete for it.
 */
function pathProblems(file: string, name: string, v: Omit<Vendored, "name" | "license">): string[] {
	const out: string[] = [];
	if (escapesLexically(name)) out.push(`${file}: /${name} names no package in node_modules`);
	const sources: [string, string | undefined][] = [
		["from", v.from],
		["types", v.types],
	];
	for (const [key, rel] of sources)
		if (rel !== undefined && escapesLexically(rel)) out.push(`${file}: /${name}/${key} leaves the package`);
	if (escapesLexically(v.to) || !/(^|\/)vendor\/[^/]/.test(slashed(v.to)))
		out.push(`${file}: /${name}/to must be a folder under a vendor/ folder`);
	return out;
}

/** The libraries `file` declares, copied to `base`/their `to`. */
async function declared(root: string, file: string, base: string): Promise<Vendored[]> {
	if (!existsSync(join(root, file))) return [];
	const problems: string[] = [];
	const decl = await readJson(root, file, problems);
	if (!isObject(decl)) throw new ValidationError([...problems, `${file}: an object of package names`]);
	return Object.entries(decl).map(([name, v]) => {
		const { from, types, to, license } = isObject(v) ? v : {};
		if (
			typeof from !== "string" ||
			typeof to !== "string" ||
			typeof license !== "string" ||
			(types !== undefined && typeof types !== "string")
		) {
			throw new ValidationError([`${file}: /${name} needs "from", "to" and "license" strings, and "types" if any`]);
		}
		const unsafe = pathProblems(file, name, { from, to, ...(types === undefined ? {} : { types }) });
		if (unsafe.length > 0) throw new ValidationError(unsafe);
		return { name, from, to: `${base}/${slashed(to)}`, license, ...(types === undefined ? {} : { types }) };
	});
}

/** The kit's declarations, then each plugin's. */
async function declarations(root: string): Promise<Vendored[]> {
	const plugins = existsSync(join(root, "plugins")) ? (await readdir(join(root, "plugins"))).toSorted() : [];
	const own = await Promise.all(plugins.map(p => declared(root, `plugins/${p}/vendor.json`, `plugins/${p}`)));
	return [...(await declared(root, KIT_DECLARED, "kit")), ...own.flat()];
}

async function version(name: string): Promise<string> {
	const problems: string[] = [];
	const pkg = await readJson(PACKAGES, `${name}/package.json`, problems);
	const v = isObject(pkg) ? pkg.version : undefined;
	if (typeof v !== "string") throw new ValidationError([...problems, `${name}: no version in its package.json`]);
	return v;
}

/** `dir`'s files (nested ones too) that `keep` takes, as `to/<path>` → content, into `files`. */
async function copyTree(dir: string, to: string, keep: (f: string) => boolean, files: Map<string, string>) {
	for (const f of (await filesUnder(dir)).filter(keep)) files.set(`${to}/${f}`, await readFile(join(dir, f), "utf8"));
}

/** Whether a package file is one a vendored copy keeps: its modules, their types and package.json. */
function isModule(f: string): boolean {
	return f.endsWith(".js") || f.endsWith(".d.ts") || f === "package.json";
}

/** Every vendored file (path → content), and the folders the build owns. */
export async function vendorFiles(root: string): Promise<{ files: Map<string, string>; dirs: string[] }> {
	const files = new Map<string, string>();
	const vendored = await declarations(root);
	for (const v of vendored) {
		const pkg = join(PACKAGES, v.name);
		await copyTree(join(pkg, v.from), v.to, isModule, files);
		if (v.types) await copyTree(join(pkg, v.types), v.to, f => f.endsWith(".d.ts"), files);
		const license = existsSync(join(pkg, "LICENSE"))
			? join(pkg, "LICENSE")
			: join(root, "kit/licenses", `${v.license}.txt`);
		files.set(`${v.to}/LICENSE`, await readFile(license, "utf8"));
		files.set(
			`${v.to}/NOTICE.md`,
			`${v.name} ${await version(v.name)} (${v.license}), copied from its npm package by \`bun run build\`; don't edit.\n`,
		);
	}
	return { files, dirs: vendored.map(v => v.to) };
}
