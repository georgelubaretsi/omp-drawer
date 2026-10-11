import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { at, message, Sessions } from "./fixtures";

let sessions: Sessions;

beforeEach(() => {
	sessions = new Sessions();
});

afterEach(() => sessions.cleanup());

// A long question: page parts are cut at 1,500 characters, asks never are.
const longQuestion = `Which layout? ${"Each option changes how the files are split. ".repeat(40)}Pick one.`;

const questions = [
	{
		id: "store",
		question: "Which store?",
		options: [{ label: "SQLite", description: "one file" }, { label: "Postgres" }],
	},
	{
		id: "layout",
		question: longQuestion,
		options: [{ label: "Flat" }, { label: "Nested", description: "one folder per area" }],
	},
	{
		id: "targets",
		question: "Which targets?",
		options: [{ label: "macOS" }, { label: "Linux" }, { label: "Windows" }],
		multi: true,
	},
	{ id: "later", question: "Anything else?", options: [{ label: "No" }] },
];

// What omp writes in the answer's details: one result per question.
const results = [
	{
		id: "store",
		question: "Which store?",
		options: ["SQLite", "Postgres"],
		multi: false,
		selectedOptions: ["Postgres"],
	},
	{
		id: "layout",
		question: longQuestion,
		options: ["Flat", "Nested"],
		multi: false,
		selectedOptions: [],
		customInput: "nested, but flat for tests",
	},
	{
		id: "targets",
		question: "Which targets?",
		options: ["macOS", "Linux", "Windows"],
		multi: true,
		selectedOptions: ["macOS", "Linux"],
	},
	{ id: "later", question: "Anything else?", options: ["No"], multi: false, selectedOptions: [] },
];

const askBlock = [
	"store: Which store?",
	"  - SQLite: one file",
	"  - Postgres",
	"  picked: Postgres",
	`layout: ${longQuestion}`,
	"  - Flat",
	"  - Nested: one folder per area",
	'  typed: "nested, but flat for tests"',
	"targets: Which targets?",
	"  - macOS",
	"  - Linux",
	"  - Windows",
	"  picked: macOS, Linux",
	"later: Anything else?",
	"  - No",
	"  no answer",
];

function writeAsk(answered: boolean): void {
	sessions.write("01a0eeee", [
		{ type: "session", timestamp: at(0) },
		message(1, "user", "set it up"),
		message(2, "assistant", [
			{ type: "text", text: "A few choices first." },
			{ type: "toolCall", id: "ask-1", name: "ask", arguments: { questions } },
		]),
		{ type: "custom", customType: "tool_execution_start", timestamp: at(3) },
		...(answered
			? [
					message(4, "toolResult", [{ type: "text", text: "User answers: …" }], {
						toolCallId: "ask-1",
						toolName: "ask",
						details: { results },
					}),
				]
			: []),
		message(5, "user", "thanks"),
	]);
}

describe("session_read and asks", () => {
	test("the answer's line shows the whole ask: every question, its options and what was picked or typed", async () => {
		writeAsk(true);
		const lines = await sessions.read({ session: "01a0eeee", line: 5 });
		expect(lines.slice(1, -1)).toEqual([
			`line 5 · ask answer · ${at(4)}`,
			`answers line 3 · ask question · ${at(2)}`,
			...askBlock,
		]);
	});

	test("the question's line shows the same ask, with the line of its answer", async () => {
		writeAsk(true);
		const lines = await sessions.read({ session: "01a0eeee", line: 3 });
		expect(lines.slice(1, -1)).toEqual([
			`line 3 · ask question · ${at(2)}`,
			"A few choices first.",
			...askBlock,
			`answered on line 5 · ${at(4)}`,
		]);
	});

	test("a question never answered says so", async () => {
		writeAsk(false);
		const lines = await sessions.read({ session: "01a0eeee", line: 3 });
		expect(lines.at(-2)).toBe("no answer: the session ends before one");
		expect(lines).not.toContain("  picked: Postgres");
	});

	test("a page shows the answer's ask whole, however long", async () => {
		writeAsk(true);
		const lines = await sessions.read({ session: "01a0eeee", line: 5, before: 1 });
		const answer = lines.slice(lines.indexOf(`line 5 · ask answer · ${at(4)}`) + 1, -2);
		expect(answer).toEqual(askBlock);
		expect(lines.join("\n")).not.toContain("characters left out");
	});

	test("an answer whose call isn't in the journal takes its questions from its own results", async () => {
		sessions.write("01a0ffff", [
			{ type: "session", timestamp: at(0) },
			message(1, "toolResult", [{ type: "text", text: "User answers: …" }], {
				toolCallId: "lost",
				toolName: "ask",
				details: { results: results.slice(0, 1) },
			}),
		]);
		const lines = await sessions.read({ session: "01a0ffff", line: 2 });
		expect(lines.slice(1, -1)).toEqual([
			`line 2 · ask answer · ${at(1)}`,
			"answers: no ask call found before it",
			"store: Which store?",
			"  - SQLite",
			"  - Postgres",
			"  picked: Postgres",
		]);
	});
});
