// The rules and skills a plugin ships, as omp gives them to agents (its
// prompts/system/system-prompt.md, internal-urls/rule-protocol.ts and skill-protocol.ts): an
// always-applied rule's body, front matter left out, in every system prompt; any other rule as a
// line in the rules list, its body read with rule://; a skill as a line in the skills list, its
// files read whole with skill://. templates/rules.md and templates/skills.md lay them out.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, sep } from "node:path";
import { isObject } from "../build/json";
import { readFrontmatter } from "../build/parse";
import type { Doc } from "./doc";
import { templates } from "./templates";

// A shipped file's front matter and the text after it, trimmed as omp trims it.
function frontAndBody(file: string): { front: Record<string, unknown>; body: string } {
	const problems: string[] = [];
	const parsed = readFrontmatter(file, readFileSync(file, "utf8"), problems);
	if (parsed === undefined || !isObject(parsed.value) || problems.length > 0)
		throw new Error(problems.join("; ") || `${file}: front matter is not a map`);
	return { front: parsed.value, body: parsed.body.trim() };
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** The plugin's rules section, or "" when it ships none; `plugin` is its folder. */
export function rulesSection(doc: Doc, plugin: string): string {
	const dir = join(plugin, "rules");
	if (!existsSync(dir)) return "";
	const files = readdirSync(dir).filter(file => file.endsWith(".md"));
	const rules = files.toSorted().map(file => {
		const { front, body } = frontAndBody(join(dir, file));
		// Rules that interrupt the agent when its output matches would need their own notes.
		if ("condition" in front || "astCondition" in front) throw new Error(`${file}: conditional rules aren't shown`);
		const name = file.slice(0, -3);
		const globs = [front.globs].flat().filter(glob => typeof glob === "string");
		// omp's rules list line (system-prompt.md): `- <name> (<globs>): <description>`.
		const entry = `- ${name} (${globs.join(", ")}): ${text(front.description)}`;
		return { name, always: front.alwaysApply === true, entry: doc.quote(entry), body: doc.quote(body) };
	});
	return templates.rules.render({ plugin: basename(plugin), rules });
}

/** The plugin's skills section, or "" when it ships none; `plugin` is its folder. */
export function skillsSection(doc: Doc, plugin: string): string {
	const dir = join(plugin, "skills");
	if (!existsSync(dir)) return "";
	const names = readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory());
	const skills = names
		.map(entry => entry.name)
		.toSorted()
		.map(name => {
			const folder = join(dir, name);
			const skill = join(folder, "SKILL.md");
			// omp's skills list line (system-prompt.md): `- <name>: <description>`.
			const entry = `- ${name}: ${text(frontAndBody(skill).front.description)}`;
			const files = readdirSync(folder, { recursive: true, encoding: "utf8" })
				.filter(file => file.endsWith(".md") && file !== "SKILL.md")
				.toSorted()
				.map(file => ({
					path: file.split(sep).join("/"),
					text: doc.quote(readFileSync(join(folder, file), "utf8").trimEnd()),
				}));
			return { name, entry: doc.quote(entry), file: doc.quote(readFileSync(skill, "utf8").trimEnd()), files };
		});
	return templates.skills.render({ plugin: basename(plugin), skills });
}
