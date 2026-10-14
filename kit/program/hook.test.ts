import { describe, expect, test } from "bun:test";
import { catalog } from "./fixture.test";
import { addContext, allow, deny, readHookInput } from "./hook";

const PRE_TOOL_USE = {
	session_id: "01a1",
	transcript_path: "/tmp/t.jsonl",
	cwd: "/work",
	hook_event_name: "PreToolUse",
	model: "gpt",
	permission_mode: "default",
	turn_id: "t1",
	tool_name: "webrun",
	tool_use_id: "u1",
	tool_input: { search_query: [{ q: "bun" }] },
};

describe("readHookInput", () => {
	test("reads a tool event's session, journal, folder, event and call", () => {
		expect(readHookInput(JSON.stringify(PRE_TOOL_USE))).toEqual({
			sessionId: "01a1",
			cwd: "/work",
			transcriptPath: "/tmp/t.jsonl",
			hookEventName: "PreToolUse",
			toolName: "webrun",
			toolInput: { search_query: [{ q: "bun" }] },
		});
	});

	test("reads an event about no tool without a call, and a session without a journal", () => {
		const event = {
			session_id: "s",
			transcript_path: null,
			cwd: "/w",
			hook_event_name: "SessionStart",
			source: "startup",
		};
		expect(readHookInput(JSON.stringify(event))).toEqual({
			sessionId: "s",
			cwd: "/w",
			hookEventName: "SessionStart",
		});
	});

	test("refuses what isn't an event", () => {
		expect(() => readHookInput("not json")).toThrow();
		expect(() => readHookInput("[]")).toThrow("the hook event has no session_id");
		expect(() => readHookInput('{"session_id":"s","cwd":"/w"}')).toThrow("the hook event has no hook_event_name");
	});
});

describe("answers", () => {
	test("deny refuses a PreToolUse call with the reason", () => {
		expect(deny(catalog.text("hook-denied"))).toEqual({
			stdout:
				'{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"web.run doesn\'t search here; use echo."}}\n',
			exitCode: 0,
		});
	});

	test("addContext gives the model the text, for the event answered", () => {
		expect(addContext(catalog.text("hook-context"))).toEqual({
			stdout: '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"The echo tool is here."}}\n',
			exitCode: 0,
		});
		expect(addContext(catalog.text("hook-context"), "SessionStart").stdout).toBe(
			'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"The echo tool is here."}}\n',
		);
	});

	test("allow says nothing", () => {
		expect(allow()).toEqual({ stdout: "", exitCode: 0 });
	});
});
