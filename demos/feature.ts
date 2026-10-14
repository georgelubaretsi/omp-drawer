// What every feature demo shares (demos/<plugin>/<feature>/scenario.ts, docs/demos.md): the
// title card and omp started, the install line at the end, and the folder omp keeps the
// project's sessions in, for setups that write a session's journal of their own.
import type { Demo } from "../tools/demo/director";
import type { Sandbox } from "../tools/demo/sandbox";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The title card, then omp started in the project. */
export async function intro(d: Demo, title: string, sub: string): Promise<void> {
	d.caption(title, sub);
	await d.wait(2500);
	await d.startOmp();
}

/** The closing card: how to install the plugin. */
export async function outro(d: Demo, plugin: string): Promise<void> {
	d.caption(`omp plugin install ${plugin}@piebird`, "github.com/georgelubaretsi/piebird");
	await d.wait(3000);
}

/**
 * The folder where omp keeps the sandbox project's sessions: the one an `omp -p` run in the project
 * made (setups run one first).
 */
export async function ompSessions(s: Sandbox): Promise<string> {
	const root = join(s.home, ".omp", "agent", "sessions");
	const folders = await readdir(root);
	if (folders.length !== 1) throw new Error(`expected one omp sessions folder, found ${folders.join(", ")}`);
	return join(root, folders[0] ?? "");
}

/** Writes a journal of `entries`, one JSON object per line. */
export async function writeJournal(file: string, entries: readonly unknown[]): Promise<void> {
	await mkdir(join(file, ".."), { recursive: true });
	await writeFile(file, `${entries.map(e => JSON.stringify(e)).join("\n")}\n`);
}
