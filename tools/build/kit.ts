// A plugin installs as its own folder and can't import from outside it, so each kit part is
// copied into the plugins whose shells use it; tests stay in kit/.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const KIT = "kit";

/**
 * Each part goes to the plugins that have one of its shell folders; core goes with any of them.
 * bun is what the shells running on Bun share: the omp extension and the program.
 */
const PARTS: { part: string; shells: string[] }[] = [
	{ part: "bun", shells: ["src", "program"] },
	{ part: "omp", shells: ["src"] },
	{ part: "claude", shells: ["com.anthropic.claudecode"] },
	{ part: "program", shells: ["program"] },
];

export function partsFor(entries: readonly string[]): string[] {
	const parts = PARTS.filter(p => p.shells.some(s => entries.includes(s))).map(p => p.part);
	return parts.length > 0 ? ["core", ...parts] : [];
}

export async function filesUnder(dir: string): Promise<string[]> {
	try {
		const found = await readdir(dir, { recursive: true, withFileTypes: true });
		return found
			.filter(e => e.isFile())
			.map(e =>
				join(e.parentPath, e.name)
					.slice(dir.length + 1)
					.replaceAll("\\", "/"),
			)
			.toSorted();
	} catch {
		return [];
	}
}

/** A kit part's files as plugins carry them: no tests, and this build's generated files over disk. */
async function partFiles(root: string, part: string, generated: Map<string, string>): Promise<Map<string, string>> {
	const source = new Map<string, string>();
	const from = join(root, KIT, part);
	for (const f of await filesUnder(from)) {
		if (!f.endsWith(".test.ts")) source.set(f, await readFile(join(from, f), "utf8"));
	}
	const prefix = `${KIT}/${part}/`;
	for (const [path, content] of generated) {
		if (path.startsWith(prefix)) source.set(path.slice(prefix.length), content);
	}
	return source;
}

/**
 * Each plugin's kit copy into `files`, and every file now under a plugin's kit/ into `owned`, so
 * a copy it no longer needs is deleted. Kit files this build generates (already in `files`, as
 * `kit/...`) are copied as generated, so one build is enough.
 */
export async function kitFiles(
	root: string,
	plugins: readonly { name: string }[],
	files: Map<string, string>,
	owned: string[],
): Promise<void> {
	const generated = new Map([...files].filter(([path]) => path.startsWith(`${KIT}/`)));
	const sources = new Map<string, Map<string, string>>();
	for (const p of plugins) {
		const dir = join(root, "plugins", p.name);
		const base = `plugins/${p.name}/${KIT}`;
		owned.push(...(await filesUnder(join(dir, KIT))).map(f => `${base}/${f}`));
		for (const part of partsFor(await readdir(dir))) {
			const source = sources.get(part) ?? (await partFiles(root, part, generated));
			sources.set(part, source);
			for (const [f, content] of source) files.set(`${base}/${part}/${f}`, content);
		}
	}
}

/** The hooks module of a plugin's Claude Code mod, which carries io-of.md's block. */
const HOOKS_MODULE = "com.anthropic.claudecode/hooks/register.ts";

/**
 * Each mod's hooks module that makes its own `ioOf($)` carries kit/claude/io-of.md's block as it
 * is: Claude Code refuses `$` passed to another file, so the block is copied by hand, and a copy
 * that drifts from the kit's tested one would read files its own way.
 */
export async function modSnippetProblems(root: string, plugins: readonly { name: string }[]): Promise<string[]> {
	const doc = await readFile(join(root, KIT, "claude", "io-of.md"), "utf8").catch(() => undefined);
	const block = doc === undefined ? undefined : /```ts\n([\s\S]*?)```/.exec(doc)?.[1];
	if (block === undefined) return [];
	const out: string[] = [];
	for (const p of plugins) {
		const file = `plugins/${p.name}/${HOOKS_MODULE}`;
		const source = await readFile(join(root, file), "utf8").catch(() => undefined);
		if (source?.includes("function ioOf(") && !source.includes(block))
			out.push(`${file}: its ioOf and placeOf differ from kit/claude/io-of.md's; copy the block as it is`);
	}
	return out;
}
