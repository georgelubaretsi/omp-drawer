// `bun tools/agent-content.ts` writes docs/agent-content/: what the omp plugins send to agents,
// one page per plugin, from made-up sample data run through each plugin's own code, in the
// wording of tools/agent-content/templates/. `--check` only compares the pages and exits 1 when
// one is out of date, missing or left over. Dates are fixed and paths neutral, so the output is
// the same on every machine. Every omp plugin in catalog.json must have a page, and every rule
// and skill a plugin ships must be on one.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import catalog from "../catalog.json" with { type: "json" };
import { agentVariantsValues } from "./agent-content/agent-variants";
import { Doc } from "./agent-content/doc";
import { sessionsValues } from "./agent-content/sessions";
import { rulesSection, skillsSection } from "./agent-content/shipped";
import { templates } from "./agent-content/templates";
import { ternValues } from "./agent-content/tern";
import { threadsValues } from "./agent-content/threads";

const ROOT = join(import.meta.dir, "..");
const PAGES = join(ROOT, "docs", "agent-content");

// Throws when an omp plugin has no page, or ships a rule or skill no page shows.
function checkCoverage(doc: Doc, plugins: string, pages: Record<string, string>): void {
	for (const { name, hosts } of catalog.plugins) {
		if (!hosts.includes("omp")) continue;
		if (!(`${name}.md` in pages)) throw new Error(`no agent-content page for the ${name} plugin`);
		const sections = [rulesSection(doc, join(plugins, name)), skillsSection(doc, join(plugins, name))];
		const shown = (section: string) => Object.values(pages).some(page => page.includes(section));
		if (!sections.every(section => section === "" || shown(section)))
			throw new Error(`a rule or skill of the ${name} plugin is on no agent-content page`);
	}
}

/** Every page, by file name. */
async function render(): Promise<Record<string, string>> {
	// Thread dates are shown in local time.
	process.env.TZ = "UTC";
	const work = mkdtempSync(join(tmpdir(), "agent-content-"));
	try {
		const doc = new Doc([
			[join(work, "sessions"), "/home/user/.omp/agent/sessions"],
			[work, "/home/user"],
			[join(ROOT, "plugins"), "/opt/omp-drawer/plugins"],
		]);
		mkdirSync(join(work, "sessions"));
		const plugins = join(ROOT, "plugins");
		const shipped = (name: string) => ({
			rules: rulesSection(doc, join(plugins, name)),
			skills: skillsSection(doc, join(plugins, name)),
		});
		const pages: Record<string, string> = {
			"index.md": templates.index.render(),
			"sessions.md": templates.sessions.render(await sessionsValues(doc, join(work, "sessions"))),
			"threads.md": templates.threads.render(threadsValues(doc, join(work, "project"), join(plugins, "threads"))),
			"tern.md": templates.tern.render(await ternValues(doc, join(plugins, "tern"))),
			"agent-variants.md": templates.agentVariants.render(await agentVariantsValues(doc, join(work, "shop-api"))),
			"workflow.md": templates.workflow.render({ rules: shipped("workflow").rules }),
			"workflow-skills.md": templates.workflowSkills.render({ skills: shipped("workflow").skills }),
			"kagi.md": templates.kagi.render(shipped("kagi")),
		};
		checkCoverage(doc, plugins, pages);
		return Object.fromEntries(Object.entries(pages).map(([name, text]) => [name, `${text}\n`]));
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

const pages = await render();
const existing = existsSync(PAGES) ? readdirSync(PAGES) : [];
const leftover = existing.filter(file => !(file in pages));
const changed = Object.keys(pages).filter(
	file => !existing.includes(file) || readFileSync(join(PAGES, file), "utf8") !== pages[file],
);
const stale = [...changed, ...leftover];
if (process.argv.includes("--check")) {
	if (stale.length > 0) {
		console.error(`docs/agent-content/ is out of date (${stale.join(", ")}): run \`just build\` and commit it`);
		process.exit(1);
	}
} else if (stale.length > 0) {
	mkdirSync(PAGES, { recursive: true });
	for (const file of leftover) rmSync(join(PAGES, file));
	for (const [name, text] of Object.entries(pages)) writeFileSync(join(PAGES, name), text);
	console.log(`wrote docs/agent-content/ (${stale.join(", ")})`);
}
