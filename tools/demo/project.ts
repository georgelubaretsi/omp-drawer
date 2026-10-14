// The made-up project a demo works in: files written into the sandbox's project folder, committed
// to a fresh git repository by a demo author when asked (dated a few days back, so the work looks
// lived in).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const AUTHOR = ["-c", "user.name=Demo", "-c", "user.email=demo@example.com"];

async function git(cwd: string, ...args: string[]): Promise<void> {
	// Your global git config (signing, hooks, templates) stays out of the demo's repository.
	const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
	const date = new Date(Date.now() - 3 * 86_400_000).toISOString();
	const dated = { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
	const proc = Bun.spawn(["git", ...AUTHOR, ...args], { cwd, env: dated, stdout: "ignore", stderr: "pipe" });
	const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${err.trim()}`);
}

/** Writes `files` (path → text) under `dir`; `commit` makes it a git repository with one commit. */
export async function writeProject(dir: string, files: Record<string, string>, commit?: string): Promise<void> {
	for (const [path, text] of Object.entries(files)) {
		await mkdir(dirname(join(dir, path)), { recursive: true });
		await writeFile(join(dir, path), text);
	}
	if (!commit) return;
	await git(dir, "init", "--quiet", "--initial-branch=main");
	// Commits the agent makes in the demo carry the demo author too.
	await git(dir, "config", "user.name", "Demo");
	await git(dir, "config", "user.email", "demo@example.com");
	await git(dir, "add", "--all");
	await git(dir, "commit", "--quiet", "--message", commit);
}
