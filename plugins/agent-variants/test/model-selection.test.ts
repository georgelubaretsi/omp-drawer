import { describe, expect, test } from "bun:test";
import type { ModelCandidate, ModelCost } from "../src/domain";
import { selectModels } from "../src/model-selection";

const FREE: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function paid(input: number, output: number): ModelCost {
	return { input, output, cacheRead: input / 10, cacheWrite: 0 };
}

function model(
	provider: string,
	id: string,
	cost: ModelCost,
	efforts: readonly string[] = ["low", "high", "max"],
): ModelCandidate {
	return { provider, id, name: id.replaceAll("-", " "), cost, efforts };
}

describe("selectModels", () => {
	test("orders free routes before subscription and excludes unapproved paid routes", () => {
		const result = selectModels(
			[
				model("openrouter", "stealth/ox-alpha", FREE),
				model("opencode-go", "ox-alpha-free", FREE),
				model("zai", "ox-alpha", paid(1, 2)),
				model("paid-api", "ox-alpha", paid(0.2, 0.4)),
			],
			{
				query: "ox alpha",
				thinking: "max",
				subscriptionProviders: ["zai"],
				approvedPaidSelectors: [],
				includePaidFallbacks: false,
			},
		);

		expect(result.status).toBe("ready");
		if (result.status !== "ready") return;
		expect(result.models.map(candidate => candidate.selector)).toEqual([
			"opencode-go/ox-alpha-free",
			"openrouter/stealth/ox-alpha",
			"zai/ox-alpha",
		]);
	});

	test("requires approval and presents paid routes cheapest first", () => {
		const result = selectModels(
			[model("expensive", "kimi-k3", paid(4, 12)), model("cheap", "kimi-k3", paid(0.5, 1.5))],
			{
				query: "kimi k3",
				thinking: "max",
				subscriptionProviders: [],
				approvedPaidSelectors: [],
				includePaidFallbacks: false,
			},
		);

		expect(result.status).toBe("approval_required");
		if (result.status !== "approval_required") return;
		expect(result.paid.map(candidate => candidate.selector)).toEqual(["cheap/kimi-k3", "expensive/kimi-k3"]);
	});

	test("accepts only explicitly approved paid selectors", () => {
		const result = selectModels(
			[model("cheap", "kimi-k3", paid(0.5, 1.5)), model("expensive", "kimi-k3", paid(4, 12))],
			{
				query: "kimi k3",
				thinking: "max",
				subscriptionProviders: [],
				approvedPaidSelectors: ["cheap/kimi-k3"],
				includePaidFallbacks: false,
			},
		);

		expect(result.status).toBe("ready");
		if (result.status !== "ready") return;
		expect(result.models.map(candidate => candidate.selector)).toEqual(["cheap/kimi-k3"]);
	});

	test("rejects candidates without the requested thinking level", () => {
		const result = selectModels([model("free", "kimi-k3", FREE, ["low", "high"])], {
			query: "kimi k3",
			thinking: "max",
			subscriptionProviders: [],
			approvedPaidSelectors: [],
			includePaidFallbacks: false,
		});

		expect(result).toEqual({
			status: "not_found",
			reason: "No authenticated model matches “kimi k3” with max thinking.",
		});
	});
});
