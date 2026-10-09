import { describe, expect, test } from "bun:test";
import { parse } from "yaml";
import { configureTemporaryRoute } from "../src/project-config";

function valueAt(value: unknown, path: readonly string[]): unknown {
	let current: unknown = value;
	for (const key of path) {
		if (typeof current !== "object" || current === null) return undefined;
		current = Reflect.get(current, key);
	}
	return current;
}

describe("configureTemporaryRoute", () => {
	test("adds a project role and ordered provider fallbacks while preserving settings", () => {
		const configured = configureTemporaryRoute("tools:\n  approvalMode: confirm\n", {
			agentName: "tmp-designer-ox-alpha",
			role: "tmp_designer_ox_alpha",
			selectors: ["opencode-go/ox-alpha-free", "openrouter/stealth/ox-alpha"],
			allowExisting: false,
		});
		const value: unknown = parse(configured);

		expect(valueAt(value, ["tools", "approvalMode"])).toBe("confirm");
		expect(valueAt(value, ["modelRoles", "tmp_designer_ox_alpha"])).toBe("opencode-go/ox-alpha-free");
		expect(valueAt(value, ["retry", "fallbackChains", "tmp_designer_ox_alpha"])).toEqual([
			"openrouter/stealth/ox-alpha",
		]);
	});

	test("refuses to replace an unrelated role", () => {
		expect(() =>
			configureTemporaryRoute("modelRoles:\n  tmp_designer_ox_alpha: paid/existing\n", {
				agentName: "tmp-designer-ox-alpha",
				role: "tmp_designer_ox_alpha",
				selectors: ["opencode-go/ox-alpha-free"],
				allowExisting: false,
			}),
		).toThrow("Model role tmp_designer_ox_alpha already exists.");
	});

	test("refuses an agent override that would bypass the temporary role", () => {
		expect(() =>
			configureTemporaryRoute("task:\n  agentModelOverrides:\n    tmp-designer-ox-alpha: paid/override\n", {
				agentName: "tmp-designer-ox-alpha",
				role: "tmp_designer_ox_alpha",
				selectors: ["opencode-go/ox-alpha-free"],
				allowExisting: false,
			}),
		).toThrow("Agent tmp-designer-ox-alpha has a persistent model override");
	});

	test("writes new project configuration in readable block style", () => {
		const configured = configureTemporaryRoute(undefined, {
			agentName: "tmp-designer-ox-alpha",
			role: "tmp_designer_ox_alpha",
			selectors: ["opencode-go/ox-alpha-free", "openrouter/stealth/ox-alpha"],
			allowExisting: false,
		});

		expect(configured.startsWith("modelRoles:\n")).toBe(true);
		expect(configured).toContain("    tmp_designer_ox_alpha:\n      - openrouter/stealth/ox-alpha");
	});
});
