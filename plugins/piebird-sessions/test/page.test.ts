import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PAGE_CAP } from "../core/page";
import { at, failure, message, Sessions, writePages } from "./fixtures";

let sessions: Sessions;

beforeEach(() => {
	sessions = new Sessions();
});

afterEach(() => sessions.cleanup());

const headers = (lines: string[]) => lines.filter(line => line.startsWith("line "));

describe("session_read pages", () => {
	test("pages by rendered entries: a tool loop is skipped by default and shown with tools", async () => {
		writePages(sessions);
		const plain = await sessions.read({ session: "01a0cccc", line: 10, before: 1 });
		expect(plain).toEqual([
			`line 3 · assistant · ${at(2)}`,
			"first reply",
			"",
			`line 10 · assistant · ${at(9)}`,
			"second reply — ok",
			"lines 3–10 · 2 entries",
			'earlier: session_read {"session":"01a0cccc","line":3,"before":1} · later: session_read {"session":"01a0cccc","line":10,"after":1}',
		]);

		const tools = await sessions.read({ session: "01a0cccc", line: 10, before: 2, tools: true });
		expect(tools.slice(0, -2)).toEqual([
			`line 8 · assistant · ${at(7)}`,
			'[tool call] bash {"command":"step 2"}',
			"",
			`line 9 · tool result (bash) · ${at(8)}`,
			"out 2",
			"",
			`line 10 · assistant · ${at(9)}`,
			"second reply — ok",
		]);
		expect(tools.at(-1)).toBe(
			'earlier: session_read {"session":"01a0cccc","line":8,"before":2,"tools":true} · later: session_read {"session":"01a0cccc","line":10,"after":2,"tools":true}',
		);
	});

	test("after skips thinking-only entries unless thinking, and says where the session ends", async () => {
		writePages(sessions);
		const plain = await sessions.read({ session: "01a0cccc", line: 10, after: 5 });
		expect(headers(plain)).toEqual([
			`line 10 · assistant · ${at(9)}`,
			`line 11 · user message · ${at(10)}`,
			`line 13 · assistant · ${at(12)}`,
		]);
		expect(plain.at(-1)).toBe(
			'earlier: session_read {"session":"01a0cccc","line":10,"before":5} · later: end of session (13 lines)',
		);

		const thinking = await sessions.read({ session: "01a0cccc", line: 11, after: 1, thinking: true });
		expect(thinking.slice(0, -2)).toEqual([
			`line 11 · user message · ${at(10)}`,
			"second question",
			"",
			`line 12 · assistant · ${at(11)}`,
			"[thinking] deep thought",
		]);
	});

	test("says where the session ends when nothing the flags render follows the page", async () => {
		writePages(sessions);
		const before = await sessions.read({ session: "01a0cccc", line: 13, before: 1 });
		expect(before.at(-1)).toEndWith("later: end of session (13 lines)");
		// Line 12 is thinking alone, which this page doesn't render.
		const after = await sessions.read({ session: "01a0cccc", line: 11, after: 1 });
		expect(after.at(-1)).toEndWith("later: end of session (13 lines)");
	});

	test("user without a line reads the user's words from the start, after or not", async () => {
		writePages(sessions);
		const lines = await sessions.read({ session: "01a0cccc", user: true, after: 5 });
		expect(headers(lines)).toEqual([`line 2 · user message · ${at(1)}`, `line 11 · user message · ${at(10)}`]);
		expect(lines.at(-1)).toBe("earlier: start of session · later: end of session (13 lines)");
		expect(await sessions.read({ session: "01a0cccc", user: true })).toEqual(lines);
	});

	test("raw returns exactly the journal lines, nothing else", async () => {
		const journal = writePages(sessions);
		const lines = await sessions.read({ session: "01a0cccc", line: 10, before: 1, after: 1, raw: true });
		expect(lines.slice(0, -2)).toEqual([journal[2], journal[9], journal[10]]);
		for (const line of lines.slice(0, -2)) expect(() => JSON.parse(line) as unknown).not.toThrow();
		expect(lines.at(-1)).toContain('"raw":true');
	});

	test("the page cap stops at an entry boundary and says what it left out", async () => {
		const texts = Array.from({ length: 30 }, (_, index) => `message ${index} ${"x".repeat(1400)}`);
		sessions.write("01a0dddd", [
			{ type: "session", timestamp: at(0) },
			...texts.map(text => message(1, "user", text)),
		]);
		const lines = await sessions.read({ session: "01a0dddd", user: true, after: 30 });
		const shown = headers(lines).length;
		expect(shown).toBeGreaterThan(0);
		expect(shown).toBeLessThan(30);
		expect(lines.slice(0, -3).join("\n").length).toBeLessThanOrEqual(PAGE_CAP);
		expect(lines.filter(line => line.startsWith("message "))).toEqual(texts.slice(0, shown));
		expect(lines.at(-2)).toBe(
			`page cap of ${PAGE_CAP} characters: left out ${30 - shown} later entries (lines ${shown + 2}–31)`,
		);
		expect(lines.at(-1)).toBe(
			`earlier: start of session · later: session_read {"session":"01a0dddd","line":${shown + 1},"after":30,"user":true}`,
		);
	});
});

describe("session_read find", () => {
	test("searches what the flags render, case-insensitively", async () => {
		writePages(sessions);
		const replies = await sessions.read({ session: "01a0cccc", find: "REPLY" });
		expect(headers(replies)).toEqual([
			`line 3 · assistant · ${at(2)}`,
			`line 10 · assistant · ${at(9)}`,
			`line 13 · assistant · ${at(12)}`,
		]);
		expect(replies.slice(-2)).toEqual([
			"3 matches",
			'read one: session_read {"session":"01a0cccc","line":3,"before":3,"after":3}',
		]);

		const questions = await sessions.read({ session: "01a0cccc", find: "question", user: true });
		expect(questions.slice(0, -2)).toEqual([
			`line 2 · user message · ${at(1)}`,
			"first question",
			"",
			`line 11 · user message · ${at(10)}`,
			"second question",
		]);

		const none = await sessions.read({ session: "01a0cccc", find: "reply", user: true });
		expect(none).toEqual(["0 matches"]);
	});

	test("searches from a line, and fails on a line past the end", async () => {
		writePages(sessions);
		const lines = await sessions.read({ session: "01a0cccc", find: "reply", line: 4 });
		expect(headers(lines)).toEqual([`line 10 · assistant · ${at(9)}`, `line 13 · assistant · ${at(12)}`]);
		expect(lines.at(-2)).toBe("2 matches from line 4");
		expect(await failure(sessions.read({ session: "01a0cccc", find: "reply", line: 14 }))).toEndWith("has 13 lines");
	});
});
