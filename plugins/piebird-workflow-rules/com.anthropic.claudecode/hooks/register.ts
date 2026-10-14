// piebird-workflow-rules's Claude Code part, a mod: the plugin's rules (rules/), which omp reads
// itself, in a block of the conversation's context (core/rules.ts). Claude Code computes it at the
// start of a conversation and again after compaction or /clear.
import type { Api, Register } from "claude-code";
import type { Rule } from "../../kit/core/rules";
import { contextBlock } from "../../kit/claude/context";
import { parseRule } from "../../kit/core/rules";
import { PLUGIN, rulesText } from "../../core/rules";

/** The rules in the plugin's rules/, by file name. */
async function rulesOf($: Api): Promise<Rule[]> {
	const folder = `${$.plugin.root}/rules`;
	const files = (await $.fs.list(folder)).filter(entry => entry.kind === "file" && entry.name.endsWith(".md"));
	const names = files.map(entry => entry.name).toSorted();
	return Promise.all(names.map(async name => parseRule(name.slice(0, -3), await $.fs.read(`${folder}/${name}`))));
}

export const register: Register = on => {
	on("prompt.context", async ($, e, next) => {
		const r = await next(e);
		const block = contextBlock(PLUGIN, rulesText(await rulesOf($), $.plugin.root));
		return { ...r, blocks: [...r.blocks, block] };
	});
};
