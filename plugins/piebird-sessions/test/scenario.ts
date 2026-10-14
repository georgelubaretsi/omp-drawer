// The scripted session behind piebird-sessions's "what the model sees" page (tools/model-page.ts):
// a day after the cache session in sample.ts, the user asks each agent what was decided, in a
// made-up home folder with a session of each agent in the same project.
import type { Scenario, Step } from "../../../tools/model-page/types";
import { mkdir, utimes, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sessions from "../src/index";
import { register } from "../com.anthropic.claudecode/hooks/register";
import { operations } from "../core/operations.gen";
import { traceMessages } from "../kit/core/model";
import { parts } from "../program/parts";
import { message, SAMPLE_ID, sampleJournal } from "./sample";

const SESSION = "01a2b3c4-5d6e";
const ASKED = "What did we decide about the cache yesterday?";

/** Writes a journal of `entries`, last written at `when`. */
async function journal(file: string, entries: unknown[], when: string): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${entries.map(e => JSON.stringify(e)).join("\n")}\n`);
	await utimes(file, new Date(when), new Date(when));
}

async function setup(home: string) {
	const project = `${home}/shop-api`;
	await mkdir(project, { recursive: true });
	const omp = `${home}/.omp/agent/sessions/-shop-api`;
	await journal(`${omp}/2026-10-11T09-00-00-000Z_${SAMPLE_ID}.jsonl`, sampleJournal(project), "2026-10-11T09:12:00Z");
	const other = "01a2b3c4-9999-7aaa-8bbb-ccccdddd0000";
	await journal(
		`${omp}/2026-10-11T08-30-00-000Z_${other}.jsonl`,
		[{ type: "title", title: "Fix checkout totals" }],
		"2026-10-11T08:40:00Z",
	);
	const ompId = "01a2b3d0-1111-7222-8333-444455556666";
	const ompFile = `${omp}/2026-10-12T09-00-00-000Z_${ompId}.jsonl`;
	await journal(
		ompFile,
		[{ type: "session", id: ompId, cwd: project }, message(0, "user", ASKED)],
		"2026-10-12T09:00:00Z",
	);
	const claudeId = "0c1a0de0-1111-4222-8333-444455556666";
	const claudeFile = `${home}/.claude/projects/${project.replace(/[^a-zA-Z0-9]/g, "-")}/${claudeId}.jsonl`;
	const claudeLine = { type: "user", sessionId: claudeId, cwd: project, timestamp: "2026-10-12T09:05:00.000Z" };
	await journal(claudeFile, [{ ...claudeLine, message: { role: "user", content: ASKED } }], "2026-10-12T09:05:00Z");
	const codexId = "019f0000-1111-7222-8333-444455556666";
	const codexFile = `${home}/.codex/sessions/2026/10/12/rollout-2026-10-12T09-10-00-${codexId}.jsonl`;
	const meta = { type: "session_meta", timestamp: "2026-10-12T09:10:00.000Z", payload: { id: codexId, cwd: project } };
	const asked = {
		type: "event_msg",
		timestamp: "2026-10-12T09:10:01.000Z",
		payload: { type: "user_message", message: ASKED },
	};
	await journal(codexFile, [meta, asked], "2026-10-12T09:10:01Z");
	const files = {
		omp: { id: ompId, file: ompFile },
		claude: { id: claudeId, file: claudeFile },
		codex: { id: codexId, file: codexFile },
	};
	return { project, sessions: files };
}

const STEPS: readonly Step[] = [
	{ kind: "start", title: "The session starts" },
	{ kind: "call", title: "The latest sessions", tool: "session_read", input: {} },
	{ kind: "call", title: "A session from its start", tool: "session_read", input: { session: SESSION } },
	{
		kind: "call",
		title: "What a user's message answered",
		tool: "session_read",
		input: { session: SESSION, line: 10 },
	},
	{
		kind: "call",
		title: "What a user's message followed",
		tool: "session_read",
		input: { session: SESSION, line: 11 },
	},
	{ kind: "call", title: "An ask, from its question", tool: "session_read", input: { session: SESSION, line: 6 } },
	{ kind: "call", title: "An ask, from its answer", tool: "session_read", input: { session: SESSION, line: 8 } },
	{ kind: "call", title: "An entry no reader shows", tool: "session_read", input: { session: SESSION, line: 7 } },
	{
		kind: "call",
		title: "A page with thinking and tool calls",
		tool: "session_read",
		input: { session: SESSION, line: 6, before: 2, thinking: true, tools: true },
	},
	{
		kind: "call",
		title: "A long message, cut in the middle",
		tool: "session_read",
		input: { session: SESSION, line: 12, before: 1 },
	},
	{
		kind: "call",
		title: "Only the user's words",
		tool: "session_read",
		input: { session: SESSION, user: true, after: 10 },
	},
	{ kind: "call", title: "A search", tool: "session_read", input: { session: SESSION, find: "cache" } },
	{
		kind: "call",
		title: "A search, as raw lines",
		tool: "session_read",
		input: { session: SESSION, find: "Redis", raw: true },
	},
	{
		kind: "call",
		title: "An id two sessions start with",
		tool: "session_read",
		input: { session: "01a2b3c4", line: 1 },
	},
	{ kind: "call", title: "No such session", tool: "session_read", input: { session: "01a9", line: 1 } },
	{ kind: "call", title: "A line past the end", tool: "session_read", input: { session: SESSION, line: 40 } },
	{
		kind: "call",
		title: "The user's words with tool calls",
		tool: "session_read",
		input: { session: SESSION, user: true, tools: true, after: 3 },
	},
	{
		kind: "call",
		title: "A search with before",
		tool: "session_read",
		input: { session: SESSION, find: "cache", before: 2 },
	},
	{ kind: "call", title: "before without a line", tool: "session_read", input: { session: SESSION, before: 2 } },
	{ kind: "call", title: "A list with a search", tool: "session_read", input: { find: "cache" } },
	{
		kind: "call",
		title: "An argument of the wrong kind",
		tool: "session_read",
		input: { session: SESSION, line: "ten" },
	},
];

export const scenario: Scenario = {
	plugin: "piebird-sessions",
	setup,
	steps: STEPS,
	operations,
	traceMessages,
	shells: { omp: sessions, claude: register, codex: parts },
};
