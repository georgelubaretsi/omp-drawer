import { describe, expect, test } from "bun:test";
import { isNewIn, SELF_TYPE, selfLine } from "../core/self";

const home = "/home/ada";
const id = "01a12345-6789-7abc-8def-0123456789ab";
const file = `${home}/.omp/agent/sessions/-project/2026-10-10T10-00-00-000Z_${id}.jsonl`;
const line = `This session: ${id} (~/.omp/agent/sessions/-project/2026-10-10T10-00-00-000Z_${id}.jsonl)`;

const sent = (content: string) => ({ type: "custom_message", customType: SELF_TYPE, content });

describe("the agent's own session line", () => {
	test("names the session and its journal, under ~ when it is in the home folder", () => {
		expect(selfLine({ id, file }, home).text).toBe(line);
		expect(selfLine({ id, file: `/srv/s/${id}.jsonl` }, home).text).toBe(`This session: ${id} (/srv/s/${id}.jsonl)`);
	});

	test("names the session it was forked from, by id or from the source journal's path", () => {
		const parent = "01a00000-1111-7222-8333-444455556666";
		expect(selfLine({ id, file, parent }, home).text).toBe(`${line}, forked from ${parent}`);
		const fromFile = selfLine({ id, file, parent: `/elsewhere/2026-10-09T09-00-00-000Z_${parent}.jsonl` }, home);
		expect(fromFile.text).toBe(`${line}, forked from ${parent}`);
		const fromWindows = selfLine(
			{ id, file, parent: `C:\\Users\\u\\s\\2026-10-09T09-00-00-000Z_${parent}.jsonl` },
			home,
		);
		expect(fromWindows.text).toBe(`${line}, forked from ${parent}`);
	});

	test("is new until the branch's last one says the same, and again after a compaction drops it", () => {
		const text = selfLine({ id, file }, home);
		expect(isNewIn(text, [])).toBe(true);
		expect(isNewIn(text, [sent(line), { type: "message" }])).toBe(false);
		expect(isNewIn(text, [sent(line), { type: "compaction" }])).toBe(true);
		expect(isNewIn(text, [sent(`${line}, forked from x`)])).toBe(true);
	});
});
