// What the sources of tools/sync-references.ts share: where reference/ is, running commands, and
// the staged swap and SYNCED.md section each source returns.
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..", "..");
export const REF = join(ROOT, "reference");

export interface Section {
	/** SYNCED.md heading this source owns. */
	title: string;
	lines: string[];
	/** Printed only. */
	log: string[];
}

interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

export async function run(cmd: string[], timeoutMs = 60_000): Promise<RunResult> {
	const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	clearTimeout(timer);
	return { code, stdout, stderr };
}

export async function mustRun(cmd: string[], timeoutMs?: number): Promise<string> {
	const r = await run(cmd, timeoutMs);
	if (r.code !== 0) throw new Error(`${cmd.join(" ")} exited ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`);
	return r.stdout;
}

/** Replaces `target` with the staged copy. */
export async function swap(staging: string, target: string): Promise<void> {
	await rm(target, { recursive: true, force: true });
	await rename(staging, target);
}
