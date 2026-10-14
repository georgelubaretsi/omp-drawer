// The rules as an agent with no rules of its own gets them: every always-applied rule for the main
// agent in full, then the rest by name, for the agent to read the file.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRule } from "../kit/core/rules";
import { rulesText } from "../core/rules";

const RULES = join(import.meta.dir, "..", "rules");
const rules = readdirSync(RULES)
	.filter(file => file.endsWith(".md"))
	.toSorted()
	.map(file => parseRule(file.slice(0, -3), readFileSync(join(RULES, file), "utf8")));

test("always-applied rules for the main agent come whole, others by name, a reviewer's not at all", () => {
	const text = rulesText(rules, "/plugin").text;
	for (const rule of rules) {
		const forMain = rule.agents === undefined || rule.agents.includes("main");
		const entry = `- ${rule.name}: ${rule.description} (/plugin/rules/${rule.name}.md)`;
		expect({ rule: rule.name, body: text.includes(rule.body), entry: text.includes(entry) }).toEqual({
			rule: rule.name,
			body: forMain && rule.alwaysApply,
			entry: forMain && !rule.alwaysApply,
		});
	}
});

test("without rules on demand there is no list for them", () => {
	const only = parseRule("one", "---\ndescription: One\nalwaysApply: true\n---\n# One\n");
	expect(rulesText([only], "/plugin").text).toBe("# One");
});
