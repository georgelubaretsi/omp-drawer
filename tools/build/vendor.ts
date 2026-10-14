// Libraries the kit carries as copies (a Claude Code mod can import only files in its plugin),
// declared in kit/vendor.json and copied from the build's own pinned packages, with their
// license (kit/licenses/<SPDX id>.txt).
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isObject, ValidationError } from "./json";
import { readJson } from "./parse";

const PACKAGES = join(import.meta.dir, "..", "..", "node_modules");
const DECLARED = "kit/vendor.json";

interface Vendored {
	name: string;
	from: string;
	to: string;
	license: string;
}

async function declared(root: string): Promise<Vendored[]> {
	if (!existsSync(join(root, DECLARED))) return [];
	const problems: string[] = [];
	const decl = await readJson(root, DECLARED, problems);
	if (!isObject(decl)) throw new ValidationError([...problems, `${DECLARED}: an object of package names`]);
	return Object.entries(decl).map(([name, v]) => {
		const from = isObject(v) ? v.from : undefined;
		const to = isObject(v) ? v.to : undefined;
		const license = isObject(v) ? v.license : undefined;
		if (typeof from !== "string" || typeof to !== "string" || typeof license !== "string") {
			throw new ValidationError([`${DECLARED}: /${name} needs "from", "to" and "license" strings`]);
		}
		return { name, from, to: `kit/${to}`, license };
	});
}

async function version(name: string): Promise<string> {
	const problems: string[] = [];
	const pkg = await readJson(PACKAGES, `${name}/package.json`, problems);
	const v = isObject(pkg) ? pkg.version : undefined;
	if (typeof v !== "string") throw new ValidationError([...problems, `${name}: no version in its package.json`]);
	return v;
}

/** Every vendored file (path → content), and the folders the build owns. */
export async function vendorFiles(root: string): Promise<{ files: Map<string, string>; dirs: string[] }> {
	const files = new Map<string, string>();
	const vendored = await declared(root);
	for (const v of vendored) {
		const from = join(PACKAGES, v.name, v.from);
		for (const f of (await readdir(from)).toSorted()) {
			if (f.endsWith(".js") || f.endsWith(".d.ts") || f === "package.json") {
				files.set(`${v.to}/${f}`, await readFile(join(from, f), "utf8"));
			}
		}
		files.set(`${v.to}/LICENSE`, await readFile(join(root, "kit/licenses", `${v.license}.txt`), "utf8"));
		files.set(
			`${v.to}/NOTICE.md`,
			`${v.name} ${await version(v.name)} (${v.license}), copied from its npm package by \`bun run build\`; don't edit.\n`,
		);
	}
	return { files, dirs: vendored.map(v => v.to) };
}
