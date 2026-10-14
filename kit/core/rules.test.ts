import { describe, expect, test } from "bun:test";
import { parseRule, ruleIsFor } from "./rules";

describe("parseRule", () => {
	test("reads the front matter omp's rules use, and the body after it", () => {
		const text =
			'---\ndescription: "Weigh it: likely, harmful, costly"\nagents: [main, reviewer]\nalwaysApply: true\n---\n# Proportion\n\nWeigh.\n';
		expect(parseRule("proportion", text)).toEqual({
			name: "proportion",
			description: "Weigh it: likely, harmful, costly",
			alwaysApply: true,
			agents: ["main", "reviewer"],
			body: "# Proportion\n\nWeigh.",
		});
	});

	test("a rule for no agent in particular is for every agent, and one without alwaysApply is on demand", () => {
		const rule = parseRule("changelog", "---\r\ndescription: Keep one\r\n---\r\n# Changelog\r\n");
		expect(rule).toMatchObject({ alwaysApply: false, body: "# Changelog" });
		expect(ruleIsFor(rule, "reviewer")).toBe(true);
		expect(ruleIsFor(parseRule("x", "---\nagents: main\n---\n"), "reviewer")).toBe(false);
	});
});
