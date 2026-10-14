// `bun tools/model-page.ts` writes docs/model/<plugin>.md, what each plugin with a scripted session
// (plugins/<name>/test/scenario.ts) gives the model in each harness it runs in, word for word, and
// docs/model/index.md, every plugin with its page or none. `--check` only compares the pages and
// exits 1 when one is out of date, missing or left over. Each session runs in its own process, in
// a made-up home folder, without the agents' own CLAUDE_CONFIG_DIR and CODEX_HOME, so no machine's
// files reach a page. A plugin that sends the model text without a scripted session fails both.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import catalog from "../catalog.json" with { type: "json" };
import { indexPage, unshown } from "./model-page/index";

const ROOT = join(import.meta.dir, "..");
const PAGES = join(ROOT, "docs", "model");

async function page(plugin: string): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "model-page-"));
	try {
		const { CLAUDE_CONFIG_DIR: _claude, CODEX_HOME: _codex, ...env } = process.env;
		// Times in a page read the same on every computer, and git reads none of this computer's config.
		const steady = { TZ: "UTC", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
		const proc = Bun.spawn([process.execPath, join(import.meta.dir, "model-page", "record.ts"), plugin], {
			env: { ...env, ...steady, HOME: home },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (code !== 0) throw new Error(`the ${plugin} session failed:\n${err}`);
		return out;
	} finally {
		await rm(home, { recursive: true, force: true });
	}
}

const unseen = unshown(ROOT, catalog.plugins);
if (unseen.length > 0) {
	console.error(unseen.join("\n"));
	process.exit(1);
}
const plugins = (await readdir(join(ROOT, "plugins"))).filter(name =>
	existsSync(join(ROOT, "plugins", name, "test", "scenario.ts")),
);
const pages = new Map<string, string>();
for (const plugin of plugins.toSorted()) pages.set(`${plugin}.md`, await page(plugin));
pages.set("index.md", indexPage(catalog.plugins, new Set(plugins)));

const existing = existsSync(PAGES) ? await readdir(PAGES) : [];
const stale: string[] = existing.filter(file => !pages.has(file));
for (const [file, text] of pages) {
	const current = existing.includes(file) ? await readFile(join(PAGES, file), "utf8") : undefined;
	if (current !== text) stale.push(file);
}
if (process.argv.includes("--check")) {
	if (stale.length > 0) {
		console.error(`docs/model/ is out of date (${stale.join(", ")}): run \`just build\` and commit it`);
		process.exit(1);
	}
} else if (stale.length > 0) {
	await mkdir(PAGES, { recursive: true });
	for (const file of existing.filter(f => !pages.has(f))) await rm(join(PAGES, file));
	for (const [file, text] of pages) await writeFile(join(PAGES, file), text);
	console.log(`wrote docs/model/ (${stale.join(", ")})`);
}
