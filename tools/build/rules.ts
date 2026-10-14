// The rules a plugin ships in rules/ (plugins/AGENTS.md, Conventions). An always-applied rule is
// named for whom it is, so a plugin has one per audience and grows it instead of adding files:
// `<plugin>.md` for every agent, `<plugin>-<agent>.md` for the one its `agents` names. What one
// agent always gets from a plugin's rules stays within ALWAYS_BUDGET tokens, estimated at four
// characters each: every session pays for it. A rule read on demand is one file per topic.
import type { Rule } from "../../kit/core/rules";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseRule, ruleIsFor } from "../../kit/core/rules";

export const ALWAYS_BUDGET = 1500;

/** The file name (without `.md`) an always-applied rule of `plugin` has, or why it can't have one. */
function nameFor(plugin: string, rule: Rule): { name: string } | { problem: string } {
	if (rule.agents === undefined) return { name: plugin };
	const [agent, ...more] = rule.agents;
	if (agent === undefined || more.length > 0)
		return { problem: "names more than one agent: an always-applied rule is for every agent or for one" };
	return { name: `${plugin}-${agent}` };
}

/** What is wrong with `rules`, the rules of `plugin`. */
export function ruleProblems(plugin: string, rules: readonly Rule[]): string[] {
	const problems: string[] = [];
	const always = rules.filter(rule => rule.alwaysApply);
	for (const rule of always) {
		const file = `plugins/${plugin}/rules/${rule.name}.md`;
		const wanted = nameFor(plugin, rule);
		if ("problem" in wanted) problems.push(`${file} ${wanted.problem}`);
		else if (wanted.name !== rule.name) problems.push(`${file} applies always, so it is named ${wanted.name}.md`);
	}
	const agents = new Set(["main", ...always.flatMap(rule => rule.agents ?? [])]);
	for (const agent of [...agents].toSorted()) {
		const chars = always.filter(rule => ruleIsFor(rule, agent)).reduce((sum, rule) => sum + rule.body.length, 0);
		const tokens = Math.ceil(chars / 4);
		if (tokens > ALWAYS_BUDGET)
			problems.push(
				`plugins/${plugin}/rules: the ${agent} agent always gets about ${tokens} tokens, over the ${ALWAYS_BUDGET} budget`,
			);
	}
	return problems;
}

/** The problems with every plugin's rules/. */
export async function rulesProblems(root: string, plugins: readonly { name: string }[]): Promise<string[]> {
	const problems: string[] = [];
	for (const { name } of plugins) {
		const dir = join(root, "plugins", name, "rules");
		if (!existsSync(dir)) continue;
		const files = await readdir(dir);
		const md = files.filter(file => file.endsWith(".md")).toSorted();
		const rules = await Promise.all(
			md.map(async file => parseRule(file.slice(0, -3), await readFile(join(dir, file), "utf8"))),
		);
		problems.push(...ruleProblems(name, rules));
	}
	return problems;
}
