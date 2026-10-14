import { describe, expect, test } from "bun:test";
import type { Io, RunOptions, RunResult } from "./io";
import { callVault, parseReply } from "./vault";

function fakeIo(result: RunResult, calls: [readonly string[], RunOptions | undefined][] = []): Io {
	return {
		readText: async () => undefined,
		readPieces: async () => undefined,
		list: async () => undefined,
		run: async (argv, options) => {
			calls.push([argv, options]);
			return result;
		},
	};
}

describe("the vault's reply", () => {
	test("an output", () => {
		expect(parseReply('{"output":{"n":1}}')).toEqual({ kind: "output", output: { n: 1 } });
	});

	test("a declared error with its variables, those that aren't text or numbers dropped", () => {
		expect(parseReply('{"error":{"id":"signed-out","variables":{"who":"me","n":2,"x":{}}}}')).toEqual({
			kind: "error",
			id: "signed-out",
			variables: { who: "me", n: 2 },
		});
	});

	test("not JSON, not an object, or neither: failed", () => {
		expect(parseReply("oops").kind).toBe("failed");
		expect(parseReply("3").kind).toBe("failed");
		expect(parseReply("{}").kind).toBe("failed");
	});
});

describe("callVault", () => {
	test("runs `<vault> call <operation>` with the input on stdin", async () => {
		const calls: [readonly string[], RunOptions | undefined][] = [];
		const io = fakeIo({ exitCode: 0, stdout: '{"output":"ok"}', stderr: "" }, calls);
		expect(await callVault(io, "/v", { operation: "search", input: { q: "x" } })).toEqual({
			kind: "output",
			output: "ok",
		});
		expect(calls).toEqual([[["/v", "call", "search"], { stdin: '{"q":"x"}', timeoutMs: 60_000 }]]);
	});

	test("a non-zero exit is a failure, whatever it printed", async () => {
		const io = fakeIo({ exitCode: 2, stdout: '{"output":"ok"}', stderr: "boom" });
		expect(await callVault(io, "/v", { operation: "search", input: {} })).toEqual({
			kind: "failed",
			detail: "the vault exited 2: boom",
		});
	});
});
