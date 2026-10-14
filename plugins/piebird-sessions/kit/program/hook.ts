// Codex's command hooks (developers.openai.com/codex/hooks), which follow Claude Code's protocol:
// one event as a JSON object on stdin, a decision as JSON on stdout. An answer that says nothing
// lets the tool run; so does a program that fails (exit 1), which Codex reports as a failed hook.
import type { ModelText } from "../core/model";

/** The part of a hook event the plugins read. */
export interface HookInput {
	/** The agent's session; a subagent's events carry its parent's. */
	readonly sessionId: string;
	readonly cwd: string;
	/** The session's journal, when it has one. */
	readonly transcriptPath?: string;
	/** The event: PreToolUse, PostToolUse, SessionStart, ... */
	readonly hookEventName: string;
	/** The tool call a tool event is about. */
	readonly toolName?: string;
	readonly toolInput?: unknown;
}

/** What the program writes to stdout, and the status it exits with. */
export interface HookAnswer {
	readonly stdout: string;
	readonly exitCode: number;
}

/** The event in a hook's stdin; throws when it isn't one. */
export function readHookInput(source: string): HookInput {
	const event: unknown = JSON.parse(source);
	if (typeof event !== "object" || event === null) throw new TypeError("the hook event isn't a JSON object");
	const field = (key: string): string => {
		const value: unknown = key in event ? Reflect.get(event, key) : undefined;
		if (typeof value !== "string") throw new TypeError(`the hook event has no ${key}`);
		return value;
	};
	const path: unknown = "transcript_path" in event ? event.transcript_path : undefined;
	const base = {
		sessionId: field("session_id"),
		cwd: field("cwd"),
		hookEventName: field("hook_event_name"),
		...(typeof path === "string" ? { transcriptPath: path } : {}),
	};
	if (!("tool_name" in event) || typeof event.tool_name !== "string") return base;
	return { ...base, toolName: event.tool_name, toolInput: "tool_input" in event ? event.tool_input : undefined };
}

function answer(output: unknown): HookAnswer {
	return { stdout: `${JSON.stringify(output)}\n`, exitCode: 0 };
}

/** Refuses a PreToolUse call: the tool doesn't run, and the model reads `reason` as its result. */
export function deny(reason: ModelText): HookAnswer {
	return answer({
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: reason.text,
		},
	});
}

/**
 * Lets the event go on and gives the model `context` along with it. `event` is the event being
 * answered: PreToolUse, PostToolUse, SessionStart, SubagentStart or UserPromptSubmit.
 */
export function addContext(context: ModelText, event = "PreToolUse"): HookAnswer {
	return answer({ hookSpecificOutput: { hookEventName: event, additionalContext: context.text } });
}

/** No opinion: the event goes on as if there were no hook. */
export function allow(): HookAnswer {
	return { stdout: "", exitCode: 0 };
}
