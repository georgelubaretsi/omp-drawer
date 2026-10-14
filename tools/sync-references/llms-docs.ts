// The docs sources of tools/sync-references.ts that publish llms.txt indexes of Markdown pages:
// `claude-code` (code.claude.com: plugins and mods, hooks, MCP, settings, everything) and `codex`
// (learn.chatgpt.com, and developers.openai.com's Codex and plugin sections: how plugins are
// packaged). Each copies every page its indexes name on their own site, as published, under
// reference/<dir>/ by URL path, and notes the installed CLI's version: the docs describe the
// latest release, which may be ahead of it.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { REF, run, type Section, swap } from "./shared";

interface DocsSource {
	title: string;
	dir: string;
	indexes: string[];
	/** The CLI whose `--version` the section records. */
	cli: string;
}

const FETCH_CONCURRENCY = 8;

const CLAUDE_CODE: DocsSource = {
	title: "Claude Code",
	dir: "claude-code-docs",
	indexes: ["https://code.claude.com/docs/llms.txt"],
	cli: "claude",
};

const CODEX: DocsSource = {
	title: "Codex",
	dir: "codex-docs",
	indexes: [
		"https://learn.chatgpt.com/llms.txt",
		"https://developers.openai.com/codex/llms.txt",
		"https://developers.openai.com/plugins/llms.txt",
	],
	cli: "codex",
};

/** A page's text, or undefined for a 404 (indexes name pages that are gone). */
async function fetchText(url: string): Promise<string | undefined> {
	const res = await fetch(url);
	if (res.status === 404) return undefined;
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return res.text();
}

/** Every `.md` page an index names. */
async function pagesOf(index: string): Promise<string[]> {
	const text = await fetchText(index);
	if (text === undefined) throw new Error(`${index} is missing`);
	return text.match(/https:\/\/[^\s)>\]]+\.md/g) ?? [];
}

async function stage(source: DocsSource, staging: string): Promise<{ pages: number; missing: string[] }> {
	// Indexes link each other's sites (developers.openai.com's Codex index lists learn.chatgpt.com
	// pages); pages on any of the source's sites count, other sites' don't.
	const sites = new Set(source.indexes.map(index => new URL(index).origin));
	const named = (await Promise.all(source.indexes.map(pagesOf))).flat();
	const urls = [...new Set(named.filter(url => sites.has(new URL(url).origin)))];
	if (urls.length === 0) throw new Error(`${source.indexes.join(", ")} name no page on their sites`);
	const missing: string[] = [];
	for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
		await Promise.all(
			urls.slice(i, i + FETCH_CONCURRENCY).map(async url => {
				const text = await fetchText(url);
				if (text === undefined) {
					missing.push(url);
					return;
				}
				const file = join(staging, new URL(url).pathname);
				await mkdir(dirname(file), { recursive: true });
				await writeFile(file, text);
			}),
		);
	}
	return { pages: urls.length - missing.length, missing: missing.toSorted() };
}

async function syncDocs(source: DocsSource): Promise<Section> {
	const staging = join(REF, `.staging-${source.dir}`);
	await rm(staging, { recursive: true, force: true });
	try {
		const { pages, missing } = await stage(source, staging);
		await swap(staging, join(REF, source.dir));
		const version = await run([source.cli, "--version"]);
		const installed = version.code === 0 ? version.stdout.trim() : `not installed (${source.cli} --version failed)`;
		const gone = missing.length > 0 ? `; named but missing (404): ${missing.join(", ")}` : "";
		const lines = [
			`- Synced: ${new Date().toISOString()}`,
			`- ${source.cli}: ${installed} (\`${source.cli} --version\`); the docs describe the latest release`,
			`- Docs: ${pages} pages from ${source.indexes.join(", ")} → \`${source.dir}/\` by URL path${gone}`,
		];
		return { title: source.title, lines, log: [] };
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}

export const syncClaudeCode = () => syncDocs(CLAUDE_CODE);
export const syncCodex = () => syncDocs(CODEX);
