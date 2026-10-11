import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";
import { type BranchEntry, SELF_TYPE, type SelfContext, selfMessage } from "../src/self";

const id = "01a12345-6789-7abc-8def-0123456789ab";
const file = path.join(os.homedir(), ".omp", "agent", "sessions", "-project", `2026-10-10T10-00-00-000Z_${id}.jsonl`);
const line = `This session: ${id} (~${path.sep}${path.join(".omp", "agent", "sessions", "-project", path.basename(file))})`;

function context(
	options: { kind?: "main" | "sub"; file?: string; parent?: string; branch?: BranchEntry[] } = {},
): SelfContext {
	return {
		agent: { kind: options.kind ?? "main" },
		sessionManager: {
			getSessionId: () => id,
			getSessionFile: () => ("file" in options ? options.file : file),
			getHeader: () => ({ parentSession: options.parent }),
			getBranch: () => options.branch ?? [],
		},
	};
}

const sent = (content: string) => ({ type: "custom_message", customType: SELF_TYPE, content });

describe("the agent's own session line", () => {
	test("is sent at the first prompt, with the journal under ~", () => {
		expect(selfMessage(context())).toBe(line);
	});

	test("is not sent again while the last one in the branch says the same", () => {
		expect(selfMessage(context({ branch: [sent(line), { type: "message" }] }))).toBeUndefined();
	});

	test("is sent again after a compaction drops the last one", () => {
		expect(selfMessage(context({ branch: [sent(line), { type: "compaction" }] }))).toBe(line);
	});

	test("names the session it was forked from, by id or from the source journal's path", () => {
		const parent = "01a00000-1111-7222-8333-444455556666";
		expect(selfMessage(context({ parent }))).toBe(`${line}, forked from ${parent}`);
		const fromFile = selfMessage(
			context({ parent: `/elsewhere/2026-10-09T09-00-00-000Z_${parent}.jsonl`, branch: [sent(line)] }),
		);
		expect(fromFile).toBe(`${line}, forked from ${parent}`);
		const fromWindows = selfMessage(context({ parent: `C:\\Users\\u\\s\\2026-10-09T09-00-00-000Z_${parent}.jsonl` }));
		expect(fromWindows).toBe(`${line}, forked from ${parent}`);
	});

	test("is not sent to a subagent, nor for a session without a journal", () => {
		expect(selfMessage(context({ kind: "sub" }))).toBeUndefined();
		expect(selfMessage(context({ file: undefined }))).toBeUndefined();
	});
});
