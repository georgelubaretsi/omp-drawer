// Claude Code's and Codex's journals, read as omp's: what each line stands for, shown through the
// read operation as an agent sees it.
import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { linesOf } from "../core/formats/journal";
import { claudeProjectFolder } from "../core/lookup";
import type { ReadParams } from "../core/params";
import { readSession } from "../core/read";
import { bunIo } from "../kit/bun/io";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-formats-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const at = (second: number) => `2026-10-12T10:00:${String(second).padStart(2, "0")}.000Z`;

/** The page's entries as `kind: text` pairs, read from a journal of `lines`. */
async function entries(name: string, lines: unknown[], params: Omit<ReadParams, "session"> = {}): Promise<string[]> {
	const file = path.join(dir, name);
	fs.writeFileSync(file, `${lines.map(l => JSON.stringify(l)).join("\n")}\n`);
	const context = { roots: [], list: { kind: "folder" as const, folder: dir }, home: dir };
	const text = await readSession(bunIo(), { session: file, after: 50, ...params }, context);
	const blocks = text.text.split("\n\n").filter(block => block.startsWith("line "));
	return blocks.map(block => {
		const [header = "", ...rest] = block.split("\n");
		// The page's last entry runs into its footer: "lines 2–7 · 4 entries", then the next calls.
		const end = rest.findIndex(l => l.startsWith("lines "));
		return `${header.split(" · ")[1]}: ${(end < 0 ? rest : rest.slice(0, end)).join(" | ")}`;
	});
}

describe("a Claude Code journal", () => {
	const id = "0b1b0000-1111-4222-8333-444455556666";
	const line = (second: number, type: string, content: unknown, extra: object = {}) => ({
		type,
		sessionId: id,
		timestamp: at(second),
		message: { role: type, content },
		...extra,
	});

	test("reads as words, thinking and tool calls with their results, named by the call", async () => {
		const journal = [
			{ type: "custom-title", customTitle: "Totals", sessionId: id },
			line(1, "user", "Fix the totals"),
			line(2, "assistant", [
				{ type: "thinking", thinking: "check the sum" },
				{ type: "text", text: "Looking." },
				{ type: "tool_use", id: "tu1", name: "Bash", input: { command: "cat sum.ts" } },
			]),
			line(3, "user", [{ type: "tool_result", tool_use_id: "tu1", content: "a + b" }]),
			line(4, "user", "a side question", { isSidechain: true }),
			line(5, "user", "<command-name>/clear</command-name>", { isMeta: true }),
			line(6, "assistant", [{ type: "text", text: "Fixed." }]),
		];
		expect(await entries("claude.jsonl", journal, { thinking: true, tools: true })).toEqual([
			"user message: Fix the totals",
			'assistant: [thinking] check the sum | Looking. | [tool call] Bash {"command":"cat sum.ts"}',
			"tool result (Bash): a + b",
			"assistant: Fixed.",
		]);
	});
});

/** A Codex response item's words. */
const said = (role: string, text: string) => ({
	type: "message",
	role,
	content: [{ type: role === "user" ? "input_text" : "output_text", text }],
});

describe("a Codex journal", () => {
	const meta = { type: "session_meta", timestamp: at(0), payload: { id: "019f", cwd: "/w" } };
	const item = (second: number, payload: object) => ({ type: "response_item", timestamp: at(second), payload });
	const event = (second: number, payload: object) => ({ type: "event_msg", timestamp: at(second), payload });

	test("reads the response items, and from events only what they lack", async () => {
		const journal = [
			meta,
			item(1, said("user", "Sum up my notes")),
			event(1, { type: "user_message", message: "Sum up my notes" }),
			item(2, { type: "reasoning", summary: [{ type: "summary_text", text: "read the file" }] }),
			item(3, { type: "function_call", name: "shell", call_id: "c1", arguments: '{"command":["cat","notes.txt"]}' }),
			item(4, { type: "function_call_output", call_id: "c1", output: "hello notes" }),
			item(5, said("assistant", "The notes say hello.")),
			event(5, { type: "agent_message", message: "The notes say hello." }),
			event(6, { type: "thread_name_updated", thread_name: "Notes" }),
			event(7, { type: "user_message", message: "Thanks" }),
		];
		expect(await entries("codex.jsonl", journal, { thinking: true, tools: true })).toEqual([
			"user message: Sum up my notes",
			"assistant: [thinking] read the file",
			'assistant: [tool call] shell {"command":["cat","notes.txt"]}',
			"tool result (shell): hello notes",
			"assistant: The notes say hello.",
			"user message: Thanks",
		]);
	});

	test("leaves out the turns a rollback undid, back to their user message", async () => {
		const journal = [
			meta,
			item(1, said("user", "first")),
			item(2, said("assistant", "one")),
			item(3, said("user", "second")),
			item(4, said("assistant", "two")),
			event(5, { type: "thread_rolled_back", num_turns: 1 }),
			item(6, said("user", "third")),
			item(7, said("assistant", "three")),
		];
		expect(await entries("rollback.jsonl", journal)).toEqual([
			"user message: first",
			"assistant: one",
			"user message: third",
			"assistant: three",
		]);
	});
});

async function* pieces(text: string, size: number): AsyncGenerator<string> {
	for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

describe("reading in pieces", () => {
	test("gives the same lines whatever the pieces' size, an empty line and a last line without its end included", async () => {
		const text = '{"a":1}\n\n{"b":"long line"}\n{"c":3}';
		for (const size of [1, 3, 7, text.length]) {
			const lines: string[] = [];
			for await (const l of linesOf(pieces(text, size))) lines.push(l);
			expect(lines).toEqual(['{"a":1}', "", '{"b":"long line"}', '{"c":3}']);
		}
	});
});

describe("Claude Code's project folder", () => {
	test("is the session's folder with every character but a letter or digit as -", async () => {
		expect(await claudeProjectFolder(bunIo(), "/c/projects", "/Users/ada/my app.v2")).toBe(
			"/c/projects/-Users-ada-my-app-v2",
		);
		expect(await claudeProjectFolder(bunIo(), "/c/projects", "C:\\Users\\ada\\app")).toBe(
			"/c/projects/C--Users-ada-app",
		);
	});

	test("for a long path, is the folder whose name starts the same, as Claude Code ends it with its own hash", async () => {
		const projects = path.join(dir, "projects");
		const cwd = `/${"deep/".repeat(50)}app`;
		const start = cwd.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 200);
		fs.mkdirSync(path.join(projects, `${start}-1x2y3z`), { recursive: true });
		expect(await claudeProjectFolder(bunIo(), projects, cwd)).toBe(`${projects}/${start}-1x2y3z`);
	});
});
