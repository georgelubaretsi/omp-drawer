import { describe, expect, test } from "bun:test";
import { parseRule } from "../../kit/core/rules";
import { ALWAYS_BUDGET, ruleProblems } from "./rules";

const ALWAYS = "alwaysApply: true";
const rule = (name: string, front: string, body = "Text.") => parseRule(name, `---\n${front}\n---\n${body}\n`);
/** A rule whose body is `tokens` tokens long, at four characters each. */
const sized = (name: string, front: string, tokens: number) => rule(name, front, "x".repeat(tokens * 4));

describe("an always-applied rule is named for whom it is", () => {
	test("for every agent, for one agent, and rules read on demand under any name", () => {
		const rules = [
			rule("p", ALWAYS),
			rule("p-main", `${ALWAYS}\nagents: main`),
			rule("p-reviewer", `${ALWAYS}\nagents: reviewer`),
			rule("changelog", "description: Changelogs"),
		];
		expect(ruleProblems("p", rules)).toEqual([]);
	});

	test("one named for its topic is refused with the name it needs", () => {
		expect(ruleProblems("p", [rule("proportion", ALWAYS), rule("ask", `${ALWAYS}\nagents: main`)])).toEqual([
			"plugins/p/rules/proportion.md applies always, so it is named p.md",
			"plugins/p/rules/ask.md applies always, so it is named p-main.md",
		]);
	});

	test("one for two agents can't be named for either", () => {
		expect(ruleProblems("p", [rule("p-main", `${ALWAYS}\nagents: [main, reviewer]`)])).toEqual([
			"plugins/p/rules/p-main.md names more than one agent: an always-applied rule is for every agent or for one",
		]);
	});
});

describe("what one agent always gets stays within the budget", () => {
	test("at the budget passes, a token over it fails", () => {
		expect(ruleProblems("p", [sized("p", ALWAYS, ALWAYS_BUDGET)])).toEqual([]);
		expect(ruleProblems("p", [rule("p", ALWAYS, "x".repeat(ALWAYS_BUDGET * 4 + 1))])).toEqual([
			`plugins/p/rules: the main agent always gets about ${ALWAYS_BUDGET + 1} tokens, over the ${ALWAYS_BUDGET} budget`,
		]);
	});

	test("each agent counts the rule for every agent and its own, not another agent's", () => {
		const rules = [
			sized("p", ALWAYS, 1000),
			sized("p-main", `${ALWAYS}\nagents: main`, 600),
			sized("p-reviewer", `${ALWAYS}\nagents: reviewer`, 400),
		];
		expect(ruleProblems("p", rules)).toEqual([
			`plugins/p/rules: the main agent always gets about 1600 tokens, over the ${ALWAYS_BUDGET} budget`,
		]);
	});

	test("rules read on demand don't count", () => {
		expect(ruleProblems("p", [sized("p", ALWAYS, 1000), sized("changelog", "description: x", 1000)])).toEqual([]);
	});
});
