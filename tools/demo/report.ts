// The demo's report, demos/<plugin>/report.md: what each agent did for each prompt, so a change
// that makes an agent stumble shows in the diff. Also the line the recorder prints.
import type { Prompted } from "./director";

/** The agents' names as people know them. */
const NAMES = { omp: "omp", claude: "Claude Code", codex: "Codex" };

export interface Report {
	page: string;
	summary: string;
	/** Set when a tool call failed: what to do about it. */
	stumbled: string | undefined;
}

function intro(plugin: string): string[] {
	return [
		`# ${plugin}: what the agents did in its demo`,
		"",
		`\`bun tools/demo/record.ts ${plugin}\` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).`,
		"",
		"A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.",
		"",
		"| Agent | Prompt | Seconds | Tool calls | Failed |",
		"| --- | --- | --- | --- | --- |",
	];
}

/** One prompt's section: its tool calls in order, each with its intent and, when it failed, why. */
function section(p: Prompted): string[] {
	const calls = p.calls.map((call, i) => {
		const failed = call.error === undefined ? "" : `. **Failed:** ${call.error}`;
		return `${i + 1}. \`${call.tool}\`: ${call.intent}${failed}`;
	});
	return ["", `## ${NAMES[p.agent]}: ${p.prompt}`, "", ...(calls.length > 0 ? calls : ["No tool calls."])];
}

function failedIn(p: Prompted): number {
	return p.calls.filter(call => call.error !== undefined).length;
}

export function report(plugin: string, prompts: Prompted[]): Report {
	const rows = prompts.map(
		p => `| ${NAMES[p.agent]} | ${p.prompt} | ${p.seconds} | ${p.calls.length} | ${failedIn(p)} |`,
	);
	const failed = prompts.reduce((sum, p) => sum + failedIn(p), 0);
	const calls = prompts.reduce((sum, p) => sum + p.calls.length, 0);
	return {
		page: `${[...intro(plugin), ...rows, ...prompts.flatMap(section)].join("\n")}\n`,
		summary: `${prompts.length} prompts, ${calls} tool calls, ${failed} failed`,
		stumbled:
			failed > 0
				? `The agent stumbled: ${failed} tool calls failed (demos/${plugin}/report.md). Fix what the plugin tells it (skill, rule, tool description, error text), then record again.`
				: undefined,
	};
}
