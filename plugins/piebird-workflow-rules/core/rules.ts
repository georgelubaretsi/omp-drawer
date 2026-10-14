// The plugin's rules for an agent with no rules of its own: the always-applied ones for the main
// agent in full, as omp puts them in its system prompt, then the others, each by its name, what it
// is about and its file, for the agent to read when one fits. A rule for other agents only (a
// reviewer's) is left out.
import type { ModelText } from "../kit/core/model";
import type { Rule } from "../kit/core/rules";
import { joinText } from "../kit/core/model";
import { ruleIsFor } from "../kit/core/rules";
import { model } from "./model.gen";

export const PLUGIN = "piebird-workflow-rules";

/** The rules' text for the main agent; `plugin` is the plugin's folder, where the files are. */
export function rulesText(rules: readonly Rule[], plugin: string): ModelText {
	const mine = rules.filter(rule => ruleIsFor(rule, "main"));
	const always = mine.filter(rule => rule.alwaysApply).map(rule => model.text("rule", { body: rule.body }));
	const entries = mine
		.filter(rule => !rule.alwaysApply)
		.map(rule =>
			model.text("rule-entry", {
				name: rule.name,
				description: rule.description,
				file: `${plugin}/rules/${rule.name}.md`,
			}),
		);
	const onDemand = entries.length === 0 ? [] : [joinText([model.text("rules-on-demand"), ...entries])];
	return joinText([...always, ...onDemand], "paragraph");
}
