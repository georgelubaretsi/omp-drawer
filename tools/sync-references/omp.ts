// The omp source for reference/: a shallow git clone of can1357/oh-my-pi at the tag of the
// installed omp (`omp --version`), in reference/omp/. Ignored by git and not in the public repo,
// like tern-sdk/. A refresh fetches the new tag and checks it out in place, so a failed fetch
// leaves the previous checkout as it was.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mustRun, REF, type Section } from "./shared";

const OMP_URL = "https://github.com/can1357/oh-my-pi.git";
/** A shallow clone is about 300 MB on disk. */
const CLONE_TIMEOUT_MS = 600_000;

async function head(dir: string): Promise<{ commit: string; date: string }> {
	const commit = (await mustRun(["git", "-C", dir, "rev-parse", "HEAD"])).trim();
	const date = (await mustRun(["git", "-C", dir, "log", "-1", "--format=%cI"])).trim();
	return { commit, date };
}

export async function syncOmp(): Promise<Section> {
	const omp = Bun.which("omp");
	if (!omp) throw new Error("omp is not on PATH: its source is synced at the installed omp's tag");
	const version = (await mustRun([omp, "--version"])).trim();
	const number = /\d+\.\d+\.\d+\S*/.exec(version)?.[0];
	if (number === undefined) throw new Error(`cannot read a version from \`omp --version\`: ${version}`);
	const tag = `v${number}`;
	const dir = join(REF, "omp");
	let before: string | undefined;
	if (existsSync(join(dir, ".git"))) {
		before = (await head(dir)).commit;
		await mustRun(["git", "-C", dir, "fetch", "--quiet", "--depth", "1", "origin", "tag", tag], CLONE_TIMEOUT_MS);
		await mustRun(["git", "-C", dir, "checkout", "--quiet", "--detach", tag]);
	} else {
		if (existsSync(dir)) throw new Error(`${dir} exists but is not a git clone; move it away and rerun`);
		await mustRun(["git", "clone", "--quiet", "--depth", "1", "--branch", tag, OMP_URL, dir], CLONE_TIMEOUT_MS);
	}
	const after = await head(dir);
	const lines = [
		`- Synced: ${new Date().toISOString()}`,
		`- omp: ${version} (\`omp --version\`); \`omp/\` is ${OMP_URL} at ${tag} @ ${after.commit} (${after.date})`,
	];
	let log = "omp: cloned";
	if (before === after.commit) log = "omp: unchanged";
	else if (before !== undefined) log = `omp: ${before.slice(0, 12)} → ${after.commit.slice(0, 12)}`;
	return { title: "omp", lines, log: [log] };
}
