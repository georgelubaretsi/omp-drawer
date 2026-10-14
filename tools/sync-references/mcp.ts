// The `mcp` source of tools/sync-references.ts: the Model Context Protocol's own repository (the
// specification of every version and the draft, its schemas, the SEPs and the docs), a shallow git
// clone of its main branch in reference/mcp/. Ignored by git and not in the public repo, like
// omp/. A refresh fetches main and moves the checkout to it, so a failed fetch leaves the previous
// checkout as it was.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mustRun, REF, type Section } from "./shared";

const MCP_URL = "https://github.com/modelcontextprotocol/modelcontextprotocol.git";
const CLONE_TIMEOUT_MS = 300_000;

async function head(dir: string): Promise<{ commit: string; date: string }> {
	const commit = (await mustRun(["git", "-C", dir, "rev-parse", "HEAD"])).trim();
	const date = (await mustRun(["git", "-C", dir, "log", "-1", "--format=%cI"])).trim();
	return { commit, date };
}

export async function syncMcp(): Promise<Section> {
	const dir = join(REF, "mcp");
	let before: string | undefined;
	if (existsSync(join(dir, ".git"))) {
		before = (await head(dir)).commit;
		await mustRun(["git", "-C", dir, "fetch", "--quiet", "--depth", "1", "origin", "main"], CLONE_TIMEOUT_MS);
		await mustRun(["git", "-C", dir, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
	} else {
		if (existsSync(dir)) throw new Error(`${dir} exists but is not a git clone; move it away and rerun`);
		await mustRun(["git", "clone", "--quiet", "--depth", "1", MCP_URL, dir], CLONE_TIMEOUT_MS);
	}
	const after = await head(dir);
	// Dated folders are released versions; `draft` is the next one.
	const versions = readdirSync(join(dir, "schema")).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name));
	const latest = versions.toSorted().at(-1) ?? "none";
	const lines = [
		`- Synced: ${new Date().toISOString()}`,
		`- MCP: \`mcp/\` is ${MCP_URL} at main @ ${after.commit} (${after.date})`,
		`- Specification versions: ${versions.toSorted().join(", ")}, and draft; latest: ${latest} (\`mcp/docs/specification/${latest}/\`, \`mcp/schema/${latest}/\`)`,
	];
	let log = "MCP: cloned";
	if (before === after.commit) log = "MCP: unchanged";
	else if (before !== undefined) log = `MCP: ${before.slice(0, 12)} → ${after.commit.slice(0, 12)}`;
	return { title: "MCP", lines, log: [log] };
}
