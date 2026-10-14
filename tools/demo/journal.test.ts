import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent } from "./agents";
import { turnFor } from "./journal";

const PROMPT = "Search the web for the latest Bun release.";
let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Writes `entries` as one journal and reads the turn answering PROMPT from it. */
async function turn(agent: Agent, entries: unknown[]) {
	dir = mkdtempSync(join(tmpdir(), "demo-journal-"));
	writeFileSync(join(dir, "a.jsonl"), `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`);
	return turnFor(agent, { dir, glob: "*.jsonl" }, PROMPT);
}

const omp = (message: unknown) => ({ type: "message", message });
const claude = (type: string, message: unknown) => ({ type, message });
const codex = (type: string, payload: unknown) => ({ type, payload });

describe("turnFor", () => {
	test("reads omp's calls, intents and errors, and only the turn after the prompt", async () => {
		const done = await turn("omp", [
			omp({ role: "user", content: "an earlier prompt" }),
			omp({ role: "assistant", content: [{ type: "toolCall", id: "0", name: "bash", intent: "Earlier" }] }),
			omp({ role: "user", content: [{ type: "text", text: PROMPT }] }),
			omp({
				role: "assistant",
				stopReason: "toolUse",
				content: [{ type: "toolCall", id: "1", name: "web_search", intent: "Searching" }],
			}),
			omp({
				role: "toolResult",
				toolCallId: "1",
				isError: true,
				content: [{ type: "text", text: "no network\nmore" }],
			}),
			omp({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Bun 1.4.3" }] }),
		]);
		expect(done).toEqual({ end: "stop", calls: [{ tool: "web_search", intent: "Searching", error: "no network" }] });
	});

	test("reads Claude Code's tool_use blocks and is_error results, and waits for end_turn", async () => {
		const asked = [
			claude("user", { role: "user", content: PROMPT }),
			claude("assistant", { role: "assistant", stop_reason: "tool_use", content: [{ type: "thinking" }] }),
			claude("assistant", {
				role: "assistant",
				stop_reason: "tool_use",
				content: [
					{ type: "tool_use", id: "t1", name: "mcp__plugin_piebird-kagi-search_kagi__kagi_search", input: {} },
				],
			}),
			claude("user", {
				role: "user",
				content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "denied" }],
			}),
		];
		expect(await turn("claude", asked)).toBeUndefined();
		const done = await turn("claude", [
			...asked,
			claude("assistant", { role: "assistant", stop_reason: "end_turn", content: [] }),
		]);
		expect(done).toEqual({
			end: "stop",
			calls: [{ tool: "mcp__plugin_piebird-kagi-search_kagi__kagi_search", intent: "", error: "denied" }],
		});
	});

	test("reads Codex's calls, counts an output that says it failed, and ends at task_complete", async () => {
		const done = await turn("codex", [
			codex("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: PROMPT }] }),
			codex("response_item", {
				type: "function_call",
				call_id: "c1",
				name: "kagi_search",
				arguments: '{"query":"bun"}',
			}),
			codex("response_item", {
				type: "function_call_output",
				call_id: "c1",
				output: "Wall time: 1 seconds Output: ok",
			}),
			codex("response_item", {
				type: "function_call",
				call_id: "c2",
				name: "exec_command",
				arguments: '{"cmd":"false"}',
			}),
			codex("response_item", {
				type: "function_call_output",
				call_id: "c2",
				output: "Chunk ID: 1\nProcess exited with code 1",
			}),
			codex("response_item", {
				type: "custom_tool_call",
				call_id: "c3",
				name: "exec",
				input: "text(await tools.exec_command({cmd:'kagi'}))",
			}),
			codex("response_item", {
				type: "custom_tool_call_output",
				call_id: "c3",
				output: [{ type: "input_text", text: '{"exit_code":1,"output":"curl: (6) Could not resolve host"}' }],
			}),
			codex("event_msg", { type: "task_complete" }),
		]);
		expect(done?.end).toBe("stop");
		const calls = done?.calls ?? [];
		expect(calls.slice(0, 2)).toEqual([
			{ tool: "kagi_search", intent: '{"query":"bun"}' },
			{ tool: "exec_command", intent: '{"cmd":"false"}', error: "Process exited with code 1" },
		]);
		expect(calls[2]?.tool).toBe("exec");
		expect(calls[2]?.intent).toBe("text(await tools.exec_command({cmd:'kagi'}))");
		expect(calls[2]?.error).toContain('exit_code\\":1');
		expect(calls).toHaveLength(3);
	});
});
