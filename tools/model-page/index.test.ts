import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { put } from "../build/fixtures";
import { indexPage, unshown } from "./index";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function repo(files: Readonly<Record<string, string>>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "model-index-"));
	roots.push(root);
	for (const [path, text] of Object.entries(files)) await put(root, path, text);
	return root;
}

test("a plugin that ships text for the model needs a scripted session; one that ships none doesn't", async () => {
	const root = await repo({
		"plugins/look/so.stencil.tern/style.css": "",
		"plugins/rules/rules/a.md": "---\n---\n",
		"plugins/skill/skills/s/SKILL.md": "",
		"plugins/shown/core/model.ftl": "a = A\n",
		"plugins/shown/test/scenario.ts": "",
	});
	const plugins = ["look", "rules", "skill", "shown"].map(name => ({ name, hosts: ["omp"] }));
	expect(unshown(root, plugins)).toEqual([
		"plugins/rules sends the model rules but has no test/scenario.ts to show it",
		"plugins/skill sends the model skills but has no test/scenario.ts to show it",
	]);
});

test("the index links each page and says which plugins send nothing", () => {
	const page = indexPage(
		[
			{ name: "shown", hosts: ["omp", "claude"] },
			{ name: "look", hosts: ["omp", "tern"] },
		],
		new Set(["shown"]),
	);
	expect(page).toContain("| [shown](shown.md) | omp, Claude Code |");
	expect(page).toContain("| look | omp, Tern; it sends the model nothing |");
});
