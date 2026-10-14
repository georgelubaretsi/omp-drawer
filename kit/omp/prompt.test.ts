// Adding a plugin's text to omp's system prompt: appended after what's there, nothing when the
// plugin has nothing to add. omp is a fake `pi` whose before_agent_start handler the test calls.
import { describe, expect, test } from "bun:test";
import { Catalog } from "../core/model";
import type { OmpContext } from "./io";
import { addToSystemPrompt, type PromptHost } from "./prompt";

const catalog = new Catalog<{ instructions: undefined }>("instructions = Search with Kagi.\n");

type Handler = Parameters<PromptHost["on"]>[1];

function captured(text: Parameters<typeof addToSystemPrompt>[1]): Handler {
	let handler: Handler | undefined;
	addToSystemPrompt({ on: (_event, h) => (handler = h) }, text);
	if (handler === undefined) throw new Error("no before_agent_start handler");
	return handler;
}

describe("addToSystemPrompt", () => {
	test("appends the text, given the session's context, to the system prompt", async () => {
		const contexts: OmpContext[] = [];
		const handler = captured(async ctx => {
			contexts.push(ctx);
			return catalog.text("instructions");
		});
		const result = await handler({ systemPrompt: ["You are omp.", "Other plugin."] }, { cwd: "/work" });
		expect(result).toEqual({ systemPrompt: ["You are omp.", "Other plugin.", "Search with Kagi."] });
		expect(contexts).toEqual([{ cwd: "/work" }]);
	});

	test("leaves the system prompt alone when there is no text", async () => {
		const handler = captured(async () => undefined);
		expect(await handler({ systemPrompt: ["You are omp."] }, { cwd: "/work" })).toBeUndefined();
	});
});
