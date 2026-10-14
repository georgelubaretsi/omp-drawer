// Core code stays pure, so a relative import is the one way it could reach a shell: each must land
// in the plugin's core/ or its kit/core/ copy. What a core file may use itself is oxlint's
// (.oxlintrc.json, the core override); it can't follow a relative path to where it leads.
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path/posix";
import { filesUnder, KIT } from "./kit";

const SCANNED = /\.(ts|js|mjs)$/;
const EXEMPT = /\.(test|d)\.ts$/;
const scanner = new Bun.Transpiler({ loader: "ts" });

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
		for (const f of await filesUnder(join(root, dir))) {
			if (!SCANNED.test(f) || EXEMPT.test(f)) continue;
			const file = `${dir}/${f}`;
			for (const { path } of scanner.scanImports(await readFile(join(root, file), "utf8"))) {
				if (!path.startsWith(".")) continue;
				const target = normalize(join(dirname(file), path));
				if (!allowed.some(a => target.startsWith(`${a}/`))) {
					problems.push(`${file}: imports ${path}, outside ${allowed.join(" and ")}; core code stays pure`);
				}
			}
		}
	}
	return problems;
}
