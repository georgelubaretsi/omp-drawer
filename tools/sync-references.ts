#!/usr/bin/env bun
// Refreshes ../reference. Sources: `tern` (the installed Tern's plugin API and CLI help, a copy
// of docs.stencil.so/tern, and a git clone of stencil-hq/tern-sdk) and `agent-plugins` (the
// Agent Plugins 1.0.0 schemas and spec, pinned to a release tag, with their licenses;
// sync-references/agent-plugins.ts). `bun tools/sync-references.ts [source...]` refreshes the
// named sources, all when none are named. Each source is staged first; on any failure nothing is
// swapped and the previous copy stays. Each source owns one section of SYNCED.md. Never commits.
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { syncAgentPlugins } from "./sync-references/agent-plugins";
import { mustRun, REF, ROOT, run, type Section, swap } from "./sync-references/shared";

const SYNCED = join(REF, "SYNCED.md");
const DOCS_BASE = "https://docs.stencil.so/tern/";
const SDK_URL = "https://github.com/stencil-hq/tern-sdk.git";
const FETCH_CONCURRENCY = 8;
// Help pages outside the scripting-command list that are known not to act on --help.
const EXTRA_HELP = ["plugin", "remote"];

// ── docs.stencil.so/tern ────────────────────────────────────────────────────

/** Relative `.md` page paths a docs page links to, resolved against `page`. */
function docLinks(page: string, body: string): string[] {
	const out: string[] = [];
	for (const m of body.matchAll(/\]\(\s*<?([^)\s>]+)>?/g)) {
		let target = m[1].replace(/[#?].*$/, "");
		if (target.startsWith(DOCS_BASE)) target = target.slice(DOCS_BASE.length);
		else if (target.startsWith("/tern/")) target = target.slice("/tern/".length);
		else if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue;
		else target = posix.join(posix.dirname(page), target);
		if (target.endsWith(".html")) target = `${target.slice(0, -5)}.md`;
		if (!target.endsWith(".md")) continue;
		target = posix.normalize(target);
		if (target.startsWith("..")) continue;
		out.push(target);
	}
	return out;
}

/** One fetched docs page: its body, `undefined` for a 404, or the error that stops the crawl. */
type Fetched = { page: string; body?: string; error?: Error };

async function fetchPage(page: string): Promise<Fetched> {
	try {
		const res = await fetch(DOCS_BASE + page);
		if (res.status === 404) return { page };
		if (!res.ok) return { page, error: new Error(`${DOCS_BASE}${page}: HTTP ${res.status}`) };
		return { page, body: await res.text() };
	} catch (e) {
		return { page, error: e instanceof Error ? e : new Error(String(e)) };
	}
}

async function crawlDocs(): Promise<{ pages: Map<string, string>; missing: string[] }> {
	const pages = new Map<string, string>();
	const missing: string[] = [];
	const queue = ["index.md"];
	const seen = new Set(queue);
	// At most FETCH_CONCURRENCY fetches at once; each finished page queues the links it adds.
	const active = new Map<string, Promise<Fetched>>();
	while (queue.length > 0 || active.size > 0) {
		for (const page of queue.splice(0, FETCH_CONCURRENCY - active.size)) active.set(page, fetchPage(page));
		const { page, body, error } = await Promise.race(active.values());
		active.delete(page);
		if (error) throw error;
		if (body === undefined) {
			missing.push(page);
			continue;
		}
		pages.set(page, body);
		for (const link of docLinks(page, body)) {
			if (seen.has(link)) continue;
			seen.add(link);
			queue.push(link);
		}
	}
	if (!pages.has("index.md")) throw new Error(`${DOCS_BASE}index.md is missing`);
	return { pages, missing: missing.toSorted() };
}

async function stageDocs(staging: string): Promise<{ count: number; missing: string[] }> {
	const { pages, missing } = await crawlDocs();
	for (const [page, body] of pages) {
		const file = join(staging, page);
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, body);
	}
	return { count: pages.size, missing };
}

// ── installed Tern ──────────────────────────────────────────────────────────

/** The scripting commands `tern help` lists as `tern ls|inspect|…`. */
function scriptingCommands(help: string): string[] {
	const m = help.match(/^\s*tern\s+([a-z-]+(?:\|\s*[a-z-]+)+)/m);
	return m ? m[1].split(/\|\s*/) : [];
}

async function stageInstalled(staging: string, tern: string): Promise<{ version: string; commands: string[] }> {
	const version = (await mustRun([tern, "--version"])).trim();
	await mkdir(staging, { recursive: true });
	await mustRun([tern, "plugin", "types", staging]);
	if (!existsSync(join(staging, "tern.d.luau"))) throw new Error("tern plugin types wrote no tern.d.luau");
	const help = await mustRun([tern, "help"]);
	const commands = scriptingCommands(help);
	if (commands.length < 5)
		throw new Error(`could not read the command list from \`tern help\` (got ${commands.length})`);
	const sections = [`## tern --version\n\n${version}`, `## tern help\n\n${help.trimEnd()}`];
	sections.push(`## tern help dev\n\n${(await mustRun([tern, "help", "dev"])).trimEnd()}`);
	for (const cmd of [...commands, ...EXTRA_HELP]) {
		const r = await run([tern, cmd, "--help"], 15_000);
		sections.push(`## tern ${cmd} --help\n\n${(r.stdout + r.stderr).trimEnd()}`);
	}
	await writeFile(join(staging, "cli.txt"), `${sections.join("\n\n")}\n`);
	return { version, commands: [...commands, ...EXTRA_HELP] };
}

// ── stencil-hq/tern-sdk ─────────────────────────────────────────────────────

async function syncSdk(dir: string): Promise<{ before: string | null; commit: string; date: string }> {
	let before: string | null = null;
	if (existsSync(join(dir, ".git"))) {
		before = (await mustRun(["git", "-C", dir, "rev-parse", "HEAD"])).trim();
		await mustRun(["git", "-C", dir, "pull", "--ff-only", "--quiet"], 180_000);
	} else {
		if (existsSync(dir)) throw new Error(`${dir} exists but is not a git clone; move it away and rerun`);
		await mustRun(["git", "clone", "--quiet", "--depth", "1", SDK_URL, dir], 180_000);
	}
	const commit = (await mustRun(["git", "-C", dir, "rev-parse", "HEAD"])).trim();
	const date = (await mustRun(["git", "-C", dir, "log", "-1", "--format=%cI"])).trim();
	return { before, commit, date };
}

// ── main ────────────────────────────────────────────────────────────────────

async function syncTern(): Promise<Section> {
	const docsStaging = join(REF, ".staging-docs");
	const installedStaging = join(REF, ".staging-installed");
	await rm(docsStaging, { recursive: true, force: true });
	await rm(installedStaging, { recursive: true, force: true });

	try {
		const tern = Bun.which("tern");
		const [docs, installed] = await Promise.all([
			stageDocs(docsStaging),
			tern ? stageInstalled(installedStaging, tern) : Promise.resolve(null),
		]);
		const sdk = await syncSdk(join(REF, "tern-sdk"));

		await swap(docsStaging, join(REF, "tern-docs"));
		if (installed) await swap(installedStaging, join(REF, "tern-installed"));

		const lines = [
			`- Synced: ${new Date().toISOString()}`,
			installed
				? `- Tern: ${installed.version} (\`tern --version\`); \`tern-installed/\` is from this build`
				: "- Tern: not on PATH; `tern-installed/` is left from an earlier sync",
			`- Tern docs: ${DOCS_BASE}: ${docs.count} pages${docs.missing.length > 0 ? `; linked but missing (404): ${docs.missing.join(", ")}` : ""}`,
			`- Tern SDK: ${SDK_URL} @ ${sdk.commit} (${sdk.date})`,
		];
		if (installed)
			lines.push(
				`- CLI help: \`tern help\`, \`tern help dev\`, \`tern <command> --help\` for ${installed.commands.join(", ")}`,
			);
		const log =
			sdk.before === null
				? "SDK: cloned"
				: sdk.before === sdk.commit
					? "SDK: unchanged"
					: `SDK: ${sdk.before.slice(0, 12)} → ${sdk.commit.slice(0, 12)} (git -C reference/tern-sdk log ${sdk.before.slice(0, 12)}..HEAD)`;
		return { title: "Tern", lines, log: [log] };
	} finally {
		await rm(docsStaging, { recursive: true, force: true });
		await rm(installedStaging, { recursive: true, force: true });
	}
}

const SOURCES: Record<string, () => Promise<Section>> = { tern: syncTern, "agent-plugins": syncAgentPlugins };
const SECTION_ORDER = ["Tern", "Agent Plugins"];

/** Replaces one `## <title>` section of SYNCED.md, keeping the other sources' sections. */
async function writeSection(section: Section): Promise<void> {
	const sections = new Map<string, string>();
	const existing = existsSync(SYNCED) ? await readFile(SYNCED, "utf8") : "";
	for (const chunk of existing.split(/^(?=## )/m)) {
		const heading = /^## (.+)\n/.exec(chunk);
		if (heading) sections.set(heading[1], chunk.trimEnd());
	}
	sections.set(section.title, [`## ${section.title}`, "", ...section.lines].join("\n"));
	// Known sections in source order, then any others as found.
	const titles = [
		...SECTION_ORDER.filter(t => sections.has(t)),
		...[...sections.keys()].filter(t => !SECTION_ORDER.includes(t)),
	];
	await writeFile(SYNCED, `# Reference sync\n\n${titles.map(t => sections.get(t)).join("\n\n")}\n`);
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const unknown = args.filter(a => !Object.hasOwn(SOURCES, a));
	if (unknown.length > 0) {
		console.error(
			`usage: bun tools/sync-references.ts [${Object.keys(SOURCES).join(" | ")} ...]  (unknown: ${unknown.join(" ")})`,
		);
		process.exit(2);
	}
	await mkdir(REF, { recursive: true });
	// A source that fails leaves its files and its SYNCED.md section as they were; sources already done stay done.
	for (const name of args.length > 0 ? [...new Set(args)] : Object.keys(SOURCES)) {
		const section = await SOURCES[name]();
		await writeSection(section);
		console.log([`${section.title}:`, ...section.lines, ...section.log].join("\n"));
	}
	const status = await run(["git", "-C", ROOT, "status", "--short", "--", "reference/"]);
	const changed = status.stdout.trim().split("\n").filter(Boolean);
	console.log(
		changed.length === 0
			? "Tracked reference: unchanged"
			: `Tracked reference: ${changed.length} paths changed (git status -- reference/; git diff --stat -- reference/)`,
	);
}

main().catch(err => {
	console.error(`sync-references: ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
