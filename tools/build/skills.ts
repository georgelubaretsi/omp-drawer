// Skills (Agent Plugins §7.1) and their SKILL.md frontmatter (Agent Skills specification).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isObject } from "./json";
import { readFrontmatter } from "./parse";
import { hasExactly, kindProblem, type PluginDir } from "./paths";
import { schemaProblems, validateSkill } from "./schemas";

/** One folder `skills/<name>` of plugin `dir`. */
async function checkSkill(root: string, dir: PluginDir, name: string, problems: string[]): Promise<void> {
	const skillDir = `${dir.base}/skills/${name}`;
	// A folder without SKILL.md is not a skill (§7.1); a miscased skill.md is reported.
	if (!hasExactly(await readdir(join(root, skillDir)), "SKILL.md", skillDir, problems)) return;
	const rel = `${skillDir}/SKILL.md`;
	const fileProblem = await kindProblem(dir, `skills/${name}/SKILL.md`, "file");
	if (fileProblem) {
		problems.push(fileProblem);
		return;
	}
	const frontmatter = readFrontmatter(rel, await readFile(join(root, rel), "utf8"), problems);
	if (!frontmatter) return;
	const fm = frontmatter.value;
	if (!validateSkill(fm)) problems.push(...schemaProblems(`${rel} frontmatter`, validateSkill.errors));
	// Agent Skills specification, `name` field: must match the parent directory name.
	if (isObject(fm) && typeof fm.name === "string" && fm.name !== name) {
		problems.push(`${rel} frontmatter: /name must equal the skill directory name "${name}" (Agent Skills)`);
	}
}

/** §7.1: skills are the immediate folders of skills/ that hold a file named exactly SKILL.md. */
export async function checkSkills(root: string, dir: PluginDir, names: string[], problems: string[]): Promise<void> {
	if (!hasExactly(names, "skills", dir.base, problems)) return;
	const entryProblem = await kindProblem(dir, "skills", "directory");
	if (entryProblem) {
		problems.push(entryProblem);
		return;
	}
	for (const entry of await readdir(join(dir.path, "skills"), { withFileTypes: true })) {
		// node_modules isn't part of the package and isn't walked by linkProblems.
		if (entry.isDirectory() && entry.name !== "node_modules") await checkSkill(root, dir, entry.name, problems);
	}
}
