import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { resolveSession } from "../src/journal";
import { failure, Sessions } from "./fixtures";

let sessions: Sessions;

// The original reader's fixture: a question, thinking alone, the reply, an ask and its answer
// (without per-question results, as older omp wrote them), then the user's own follow-ups.
const journal = [
	{ type: "session", id: "01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee", timestamp: "2026-09-01T10:00:00.000Z" },
	{ type: "message", timestamp: "2026-09-01T10:00:01.000Z", message: { role: "user", content: "Start." } },
	{
		type: "message",
		timestamp: "2026-09-01T10:00:02.000Z",
		message: {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "hidden" },
				{ type: "text", text: "Shall I delete the cache?" },
			],
		},
	},
	{
		type: "message",
		timestamp: "2026-09-01T10:00:03.000Z",
		message: { role: "assistant", content: [{ type: "thinking", thinking: "no text here" }] },
	},
	{
		type: "message",
		timestamp: "2026-09-01T10:00:04.000Z",
		message: { role: "user", content: [{ type: "text", text: "yes, delete it" }] },
	},
	{
		type: "message",
		timestamp: "2026-09-01T10:00:05.000Z",
		message: {
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: "call-1",
					name: "ask",
					arguments: {
						questions: [
							{
								id: "store",
								question: "Which store?",
								options: [{ label: "SQLite", description: "one file" }, { label: "Postgres" }],
							},
						],
					},
				},
			],
		},
	},
	{ type: "custom", customType: "tool_execution_start", timestamp: "2026-09-01T10:00:05.500Z" },
	{
		type: "message",
		timestamp: "2026-09-01T10:00:06.000Z",
		message: {
			role: "toolResult",
			toolCallId: "call-1",
			toolName: "ask",
			content: [{ type: "text", text: "User answers:\nstore: Postgres" }],
		},
	},
	{
		type: "message",
		timestamp: "2026-09-01T10:00:07.000Z",
		message: { role: "user", content: "also back it up nightly" },
	},
	{
		type: "message",
		timestamp: "2026-09-01T10:00:08.000Z",
		message: { role: "assistant", content: [{ type: "toolCall", id: "call-2", name: "bash", arguments: {} }] },
	},
	{
		type: "message",
		timestamp: "2026-09-01T10:00:09.000Z",
		message: { role: "user", content: "and keep a week of them" },
	},
];

beforeEach(() => {
	sessions = new Sessions();
	sessions.write("01a0aaaa", journal, "2026-09-01T10-00-00-000Z");
});

afterEach(() => sessions.cleanup());

describe("session_read with only a line", () => {
	test("prints a user reply with the agent text it answered, then the call to page around it", async () => {
		const lines = await sessions.read({ session: "01a0aaaa", line: 5 });
		expect(lines[0]).toEndWith("01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl");
		expect(lines.slice(1)).toEqual([
			"line 5 · user message · 2026-09-01T10:00:04.000Z",
			"yes, delete it",
			"",
			"answers line 3 · assistant · 2026-09-01T10:00:02.000Z",
			"Shall I delete the cache?",
			'around: session_read {"session":"01a0aaaa","line":5,"before":5,"after":5}',
		]);
	});

	test("prints an old-style ask answer with its question, options and the answer as written", async () => {
		const lines = await sessions.read({ session: "01a0aaaa", line: 8 });
		expect(lines.slice(1, -1)).toEqual([
			"line 8 · ask answer · 2026-09-01T10:00:06.000Z",
			"answers line 6 · ask question · 2026-09-01T10:00:05.000Z",
			"store: Which store?",
			"  - SQLite: one file",
			"  - Postgres",
			"User answers:",
			"store: Postgres",
		]);
	});

	test("prints a user message after the user's own words as following them, not answering the agent", async () => {
		const lines = await sessions.read({ session: "01a0aaaa", line: 11 });
		expect(lines.slice(1, -1)).toEqual([
			"line 11 · user message · 2026-09-01T10:00:09.000Z",
			"and keep a week of them",
			"",
			"follows line 9 · user message · 2026-09-01T10:00:07.000Z",
			"also back it up nightly",
		]);
	});

	test("fails on an unknown session and on a line past the end", async () => {
		expect(await failure(sessions.read({ session: "01a0ffff", line: 1 }))).toBe(
			`session 01a0ffff is not in ${sessions.root}`,
		);
		const file = path.join(sessions.folder, "2026-09-01T10-00-00-000Z_01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl");
		expect(await failure(sessions.read({ session: "01a0aaaa", line: 12 }))).toBe(`${file} has 11 lines`);
	});

	test("fails on a prefix shared by several sessions, listing them with their titles", async () => {
		const fork = path.join(sessions.folder, "2026-09-01T10-00-30-000Z_01a0aaaa-9999-cccc-dddd-eeeeeeeeeeee.jsonl");
		fs.writeFileSync(
			fork,
			`${JSON.stringify({ type: "title", title: "The fork" })}\n${JSON.stringify({ type: "session", title: "Old title" })}\n`,
		);
		const error = await failure(sessions.read({ session: "01a0aaaa", line: 1 }));
		expect(error.split("\n")).toEqual([
			"session 01a0aaaa matches 2 sessions; give a longer id:",
			`  ${path.join(sessions.folder, "2026-09-01T10-00-00-000Z_01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl")}`,
			`  ${fork} — The fork`,
		]);
		const lines = await sessions.read({ session: "01a0aaaa-b", line: 5 });
		expect(lines[1]).toBe("line 5 · user message · 2026-09-01T10:00:04.000Z");
	});

	test("lists at most ten sessions for a short prefix, saying how many match", async () => {
		for (let index = 10; index < 25; index++) sessions.write(`01a0dd${index}`, []);
		const error = (await failure(sessions.read({ session: "01a0dd", line: 1 }))).split("\n");
		expect(error[0]).toBe("session 01a0dd matches 15 sessions; give a longer id (the first 10 listed):");
		expect(error).toHaveLength(11);
	});

	test("reads a journal given by its path, also under ~ as the session line shows it", async () => {
		const file = path.join(sessions.folder, "2026-09-01T10-00-00-000Z_01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl");
		const lines = await sessions.read({ session: file, line: 2 });
		expect(lines.slice(1, 3)).toEqual(["line 2 · user message · 2026-09-01T10:00:01.000Z", "Start."]);
		const shown = `~/${path.relative(sessions.root, file)}`;
		expect(resolveSession(shown, [], sessions.root)).toBe(file);
	});

	test("refuses parameters that contradict each other", async () => {
		expect(await failure(sessions.read({ session: "01a0aaaa" }))).toContain("give a line, find, or after alone");
		expect(await failure(sessions.read({ session: "01a0aaaa", user: true, tools: true, after: 1 }))).toContain(
			"user shows only the user's words",
		);
		expect(await failure(sessions.read({ session: "01a0aaaa", line: 3, find: "x", after: 1 }))).toContain(
			"it takes no before or after",
		);
	});
});
