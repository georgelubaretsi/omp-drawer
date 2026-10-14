// A plugin's native program: a Go command in cmd/<program>/ (package main, in the module of
// go.mod, its shared code in internal/), named by the plugin's catalog entry (`program`).
// tools/native.ts compiles it into the plugin's native/, which the plugin runs as
// ./native/<program>. native/ is build output, never committed: the public repo's dist workflow
// builds it for the published plugins (docs/manifests.md, "Native programs").
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { CatalogEntry } from "./schemas";

/** The folder in a plugin its program's builds and its starter script go in. */
export const NATIVE_DIR = "native";

/** The folder of program's source, from the root: cmd/<program>. */
export function programDir(program: string): string {
	return `cmd/${program}`;
}

/** Problems with the programs the catalog entries name: each a command, named once. */
export async function programProblems(root: string, entries: CatalogEntry[]): Promise<string[]> {
	const out: string[] = [];
	const named = new Map<string, string>();
	for (const [i, entry] of entries.entries()) {
		if (entry.program === undefined) continue;
		const main = `${programDir(entry.program)}/main.go`;
		if (!(await lstat(join(root, main)).catch(() => undefined))?.isFile())
			out.push(`catalog.json: /plugins/${i}/program names ${programDir(entry.program)}/, which has no main.go`);
		const other = named.get(entry.program);
		if (other) out.push(`catalog.json: /plugins/${i}/program is ${other}'s program too`);
		named.set(entry.program, entry.name);
	}
	return out;
}
