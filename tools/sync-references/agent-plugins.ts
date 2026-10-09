// The `agent-plugins` source of tools/sync-references.ts: the Agent Plugins 1.0.0 schemas and spec,
// pinned to a release tag, with the project's license texts and a NOTICE.md saying what came from
// where, so reference/agent-plugins/ can be redistributed as it is.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mustRun, REF, type Section, swap } from "./shared";

const FETCH_TIMEOUT_MS = 60_000;
const AP_REPO = "https://github.com/agentplugins/agent-plugins-spec";
const AP_TAG = "v1.0.0";
const AP_VERSION = "1.0.0";
const AP_SCHEMAS = ["plugin.schema.json", "mcp.schema.json"];
// The project's licensing terms (LICENSE.md) and the license texts they name, copied as they are.
const AP_LICENSES = ["LICENSE.md", "LICENSES/Apache-2.0.txt", "LICENSES/CC-BY-4.0.txt"];

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return res.text();
}

/** The commit a tag names: the peeled commit of an annotated tag, else the tag's own object. */
async function tagCommit(repo: string, tag: string): Promise<string> {
	const refs = new Map<string, string>();
	for (const line of (await mustRun(["git", "ls-remote", "--tags", `${repo}.git`], 60_000)).split("\n")) {
		const [sha, ref] = line.split("\t");
		if (sha && ref) refs.set(ref, sha);
	}
	const commit = refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`);
	if (!commit) throw new Error(`${repo}: no tag ${tag}`);
	return commit;
}

/** NOTICE.md: where each file came from and under which license (CC-BY-4.0 asks for the source and any changes). */
function notice(commit: string): string {
	const v = AP_VERSION;
	return `# Notice

Every other file in this folder is copied unmodified from the Agent Plugins project
(copyright its contributors):

- Repository: ${AP_REPO}
- Tag: ${AP_TAG}
- Commit: ${commit}

\`tools/sync-references.ts\` copies them and writes this notice; never edit them by hand.

- \`${v}/spec.md\`: the Agent Plugins Specification ${v}, \`spec/${v}.md\` in the repository.
  Licensed under the Creative Commons Attribution 4.0 International License
  (https://creativecommons.org/licenses/by/4.0/): \`LICENSES/CC-BY-4.0.txt\`.
- \`${v}/plugin.schema.json\` and \`${v}/mcp.schema.json\`: the schemas, \`schemas/${v}/\` in the
  repository and identical to https://agent-plugins.org/schemas/${v}/. Licensed under the Apache
  License 2.0: \`LICENSES/Apache-2.0.txt\`.
- \`LICENSE.md\` and \`LICENSES/\`: the project's licensing terms and the license texts they name.
`;
}

/** Stages the license texts and NOTICE.md at the top of `staging`. */
async function stageLicenses(staging: string, raw: string, commit: string): Promise<void> {
	for (const name of AP_LICENSES) {
		await mkdir(dirname(join(staging, name)), { recursive: true });
		await writeFile(join(staging, name), await fetchText(`${raw}${name}`));
	}
	await writeFile(join(staging, "NOTICE.md"), notice(commit));
}

/** Stages `<version>/` under `staging`: spec.md and the schemas; returns the schema URLs. */
async function stageVersion(staging: string, raw: string, commit: string): Promise<string[]> {
	const dir = join(staging, AP_VERSION);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "spec.md"), await fetchText(`${raw}spec/${AP_VERSION}.md`));
	const urls: string[] = [];
	for (const name of AP_SCHEMAS) {
		const url = `https://agent-plugins.org/schemas/${AP_VERSION}/${name}`;
		const [hosted, tagged] = await Promise.all([fetchText(url), fetchText(`${raw}schemas/${AP_VERSION}/${name}`)]);
		// The build validates against these copies; a hosted schema that differs from the tagged release is not the pinned authority.
		if (hosted !== tagged)
			throw new Error(`${url} differs from schemas/${AP_VERSION}/${name} at ${AP_TAG} (${commit})`);
		const schema: unknown = JSON.parse(hosted);
		const id = typeof schema === "object" && schema !== null && "$id" in schema ? schema.$id : undefined;
		if (id !== url) throw new Error(`${url}: $id is not ${url}`);
		await writeFile(join(dir, name), hosted);
		urls.push(url);
	}
	return urls;
}

/** Replaces reference/agent-plugins/ as a whole. */
export async function syncAgentPlugins(): Promise<Section> {
	const staging = join(REF, ".staging-agent-plugins");
	await rm(staging, { recursive: true, force: true });
	try {
		const commit = await tagCommit(AP_REPO, AP_TAG);
		const raw = `${AP_REPO.replace("https://github.com/", "https://raw.githubusercontent.com/")}/${commit}/`;
		const urls = await stageVersion(staging, raw, commit);
		await stageLicenses(staging, raw, commit);
		await swap(staging, join(REF, "agent-plugins"));
		return {
			title: "Agent Plugins",
			lines: [
				`- Synced: ${new Date().toISOString()}`,
				`- Spec: ${AP_REPO} tag ${AP_TAG} @ ${commit}: \`spec/${AP_VERSION}.md\` → \`agent-plugins/${AP_VERSION}/spec.md\``,
				`- Schemas: ${urls.join(", ")} → \`agent-plugins/${AP_VERSION}/\`; identical to \`schemas/${AP_VERSION}/\` at that commit`,
				`- Licenses: ${AP_LICENSES.map(l => `\`${l}\``).join(", ")} at that commit → \`agent-plugins/\`, with \`agent-plugins/NOTICE.md\``,
			],
			log: [],
		};
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}
