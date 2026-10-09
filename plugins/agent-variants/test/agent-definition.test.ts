import { describe, expect, test } from "bun:test";
import { createAgentVariant, readTemporaryAgent } from "../src/agent-definition";

const SOURCE = `---
name: designer
description: UI specialist
tools: read, edit
model: "@designer"
thinking-level: medium
---

Preserve this exact behavior.
`;

describe("agent definitions", () => {
	test("creates a marked variant without changing behavior or tool policy", () => {
		const variant = createAgentVariant(SOURCE, {
			name: "tmp-designer-kimi-k3",
			role: "tmp_designer_kimi_k3",
			requestedModel: "Kimi K3 at max",
			createdAt: "2026-08-26T12:00:00.000Z",
			thinking: "max",
		});

		expect(variant).toContain("name: tmp-designer-kimi-k3");
		expect(variant).toContain("tools: read, edit");
		expect(variant).toContain('model: "@tmp_designer_kimi_k3"');
		expect(variant).toContain("thinking-level: max");
		expect(variant).toContain("x-omp-temporary: true");
		expect(variant).toEndWith("Preserve this exact behavior.\n");
		expect(readTemporaryAgent(variant)).toEqual({
			name: "tmp-designer-kimi-k3",
			sourceAgent: "designer",
			requestedModel: "Kimi K3 at max",
			createdAt: "2026-08-26T12:00:00.000Z",
			role: "tmp_designer_kimi_k3",
		});
	});

	test("preserves source thinking when no override is requested", () => {
		const variant = createAgentVariant(SOURCE, {
			name: "tmp-designer-kimi-k3",
			role: "tmp_designer_kimi_k3",
			requestedModel: "Kimi K3",
			createdAt: "2026-08-26T12:00:00.000Z",
		});

		expect(variant).toContain("thinking-level: medium");
	});
});
