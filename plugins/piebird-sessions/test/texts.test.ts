// The texts core/model.ftl holds, each in the output that shows it, so an edit that breaks one (a
// misspelled variable throws) fails here.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PAGE_CAP } from "../core/page";
import { at, message, Sessions } from "./fixtures";

let sessions: Sessions;

beforeEach(() => {
	sessions = new Sessions();
});

afterEach(() => sessions.cleanup());

const start = { type: "session", timestamp: at(0) };
const headers = (lines: string[]) => lines.filter(line => line.startsWith("line "));
/** A long agent text with "middle" in its middle. */
const long = `${"a".repeat(1000)}middle${"b".repeat(1000)}`;
/** The read-one step after a search that found line 2, with `raw` when the search had it. */
const readOne = (raw: string) => `read one: session_read {"session":"01a0bbbb","line":2,"before":3,"after":3${raw}}`;

describe("the texts each output shows", () => {
	test("a line names its kind: images, other messages, other entries, unparsable lines", async () => {
		sessions.write("01a0bbbb", [
			start,
			message(1, "user", [{ type: "image" }, { type: "text", text: "look" }]),
			message(2, "bashExecution", "ls"),
			{ type: "custom", customType: "x.note", timestamp: at(3) },
			"cut off",
		]);
		const line = async (number: number) => (await sessions.read({ session: "01a0bbbb", line: number })).slice(1, -1);
		expect(await line(2)).toEqual([
			`line 2 · user message · ${at(1)}`,
			"[image]",
			"look",
			"",
			"answers: no message with text before it",
		]);
		expect(await line(3)).toEqual([`line 3 · other (message, bashExecution) · ${at(2)}`, "ls"]);
		expect(await line(4)).toEqual([`line 4 · other (x.note) · ${at(3)}`, ""]);
		expect(await line(5)).toEqual(["line 5 · other (unparsable) · ", ""]);
	});

	test("long texts: a page cuts them in the middle, a reply keeps the end of what it answered", async () => {
		sessions.write("01a0bbbb", [
			start,
			message(1, "assistant", [{ type: "text", text: long }]),
			message(2, "user", "ok"),
		]);
		const page = await sessions.read({ session: "01a0bbbb", line: 2, before: 1 });
		expect(page.slice(0, 4)).toEqual([
			`line 2 · assistant · ${at(1)}`,
			"a".repeat(750),
			"… [506 characters left out] …",
			"b".repeat(750),
		]);
		const reply = await sessions.read({ session: "01a0bbbb", line: 3 });
		expect(reply.slice(-3, -1)).toEqual([`answers line 2 · assistant · ${at(1)}`, `…${long.slice(-1500)}`]);
	});

	test("find shows a snippet of the match, raw lines with raw, and how to read on past 50 matches", async () => {
		const journal = sessions.write("01a0bbbb", [
			start,
			message(1, "assistant", [{ type: "text", text: long }]),
			...Array.from({ length: 60 }, (_, index) => message(2, "user", `filler ${index}`)),
		]);
		expect(await sessions.read({ session: "01a0bbbb", find: "middle" })).toEqual([
			`line 2 · assistant · ${at(1)}`,
			`…${"a".repeat(120)}middle${"b".repeat(120)}…`,
			"1 match",
			readOne(""),
		]);
		expect(await sessions.read({ session: "01a0bbbb", find: "middle", raw: true })).toEqual([
			journal[1],
			"1 match",
			readOne(',"raw":true'),
		]);
		expect((await sessions.read({ session: "01a0bbbb", find: "filler" })).slice(-2)).toEqual([
			"60 matches, the first 50 shown",
			'more: session_read {"session":"01a0bbbb","line":53,"find":"filler"} · read one: session_read {"session":"01a0bbbb","line":3,"before":3,"after":3}',
		]);
	});

	test("an ask on a page, and an ask without an answer in the next lines says how far it looked", async () => {
		const questions = [{ id: "go", question: "Go?", options: [{ label: "Yes" }] }];
		sessions.write("01a0bbbb", [
			start,
			message(1, "assistant", [{ type: "toolCall", id: "ask-1", name: "ask", arguments: { questions } }]),
			...Array.from({ length: 201 }, (_, index) => message(2, "user", `filler ${index}`)),
		]);
		expect((await sessions.read({ session: "01a0bbbb", line: 2 })).slice(1, -1)).toEqual([
			`line 2 · ask question · ${at(1)}`,
			"go: Go?",
			"  - Yes",
			"no answer in the next 200 lines",
		]);
		expect((await sessions.read({ session: "01a0bbbb", line: 2, before: 1 })).slice(0, 4)).toEqual([
			`line 2 · assistant · ${at(1)}`,
			"[ask]",
			"go: Go?",
			"  - Yes",
		]);
	});

	test("a page capped on both sides says what it left out of each; an empty page where the session ends", async () => {
		const texts = Array.from({ length: 30 }, (_, index) => `message ${index} ${"x".repeat(1400)}`);
		sessions.write("01a0bbbb", [start, ...texts.map(text => message(1, "user", text))]);
		const lines = await sessions.read({ session: "01a0bbbb", line: 16, before: 15, after: 15 });
		const shown = headers(lines).map(header => Number(header.split(" ")[1]));
		const [first, last] = [shown[0], shown.at(-1) ?? 0];
		expect(first).toBeGreaterThan(2);
		expect(last).toBeLessThan(31);
		expect(lines.at(-2)).toBe(
			`page cap of ${PAGE_CAP} characters: left out ${first - 2} earlier entries (lines 2–${first - 1}) and ${31 - last} later entries (lines ${last + 1}–31)`,
		);

		sessions.write("01a0b000", [start, message(1, "assistant", [{ type: "text", text: "hi" }])]);
		expect(await sessions.read({ session: "01a0b000", user: true, after: 5 })).toEqual([
			"no entries to show · end of session (2 lines)",
		]);
	});
});
