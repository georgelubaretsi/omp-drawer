// The sessions plugin's outputs for templates/sessions.md, from a made-up session: a user asks
// for a cache on a slow endpoint, the agent looks at the code, asks two questions, finishes, then
// gets two follow-ups. The wording around them is in the template.
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSession, type ReadParams } from "../../plugins/sessions/src/read";
import { selfMessage } from "../../plugins/sessions/src/self";
import { templates } from "../../plugins/sessions/src/templates";
import type { Doc } from "./doc";

const ID = "01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b";
const SESSION = "01a2b3c4-5d6e";
const PROJECT_FOLDER = "-home-user-shop-api";

const at = (minute: number, second = 0) =>
	`2026-10-11T09:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`;

const message = (minute: number, role: string, content: unknown, extra: Record<string, unknown> = {}) => ({
	type: "message",
	timestamp: at(minute),
	message: { role, content, ...extra },
});

const QUESTIONS = [
	{
		id: "store",
		question: "Where should the cache live?",
		options: [
			{ label: "In memory", description: "fastest, lost on restart" },
			{ label: "Redis", description: "shared across instances" },
		],
	},
	{
		id: "ttl",
		question: "How long may a cached page be stale?",
		options: [{ label: "30 seconds" }, { label: "5 minutes" }],
	},
];

/** An agent message over the 1,500 characters a page keeps of one. */
const PLAN = [
	"Here is the plan for logging cache hits.",
	"1. In src/cache/products.ts, the read-through wrapper already knows whether a key was found; it will call logger.info with the event name cache.products, the outcome (hit or miss), the key's length rather than the key itself, and the time the lookup took in milliseconds.",
	"2. The existing logger in src/log.ts writes JSON lines, so the hit rate can be read with the same query the dashboard uses for request latency: count hits and misses per minute and divide.",
	"3. Misses that fall through to Postgres keep their current span, so the slow path stays visible in traces; hits get no span, because they take under a millisecond and would only add noise.",
	"4. Logged-in requests skip the cache entirely, so they log nothing; that keeps the hit rate honest for anonymous traffic, which is what the cache is for.",
	"5. A test in test/cache/products.test.ts will stub the logger and check one hit and one miss are logged with the right fields.",
	"6. No new dependency is needed, and the log volume is one line per request to /products, which the current retention handles: the busiest hour last week had about 40,000 requests.",
	"7. The dashboard gets a new panel, Products cache hit rate, next to the latency panel, with the same one-minute buckets and a 24-hour window by default.",
	"8. If the hit rate stays under 50% for an hour, the existing alert channel gets a warning, because that usually means the cache key includes something that changes on every request, such as a tracking parameter.",
	"If you want the key itself in the log for debugging, I can add it behind the LOG_CACHE_KEYS flag instead.",
].join("\n");

const JOURNAL = [
	{ type: "session", id: ID, timestamp: at(0), cwd: "/home/user/shop-api" },
	{ type: "title", title: "Add a response cache" },
	message(1, "user", "The /products endpoint is slow. Can you add a cache?"),
	message(2, "assistant", [
		{
			type: "thinking",
			thinking:
				"The handler queries Postgres on every request; a read-through cache keyed by the query string should do.",
		},
		{ type: "text", text: "Let me look at how the handler fetches products." },
		{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: 'rg -n "getProducts" src' } },
	]),
	message(
		3,
		"toolResult",
		[
			{
				type: "text",
				text: "src/routes/products.ts:12:  const rows = await getProducts(db, query);\nsrc/db/products.ts:4:export async function getProducts(db, query) {",
			},
		],
		{ toolCallId: "call-1", toolName: "bash" },
	),
	message(4, "assistant", [
		{ type: "text", text: "Every request hits the database. Two choices before I write it:" },
		{ type: "toolCall", id: "ask-1", name: "ask", arguments: { questions: QUESTIONS } },
	]),
	{ type: "custom", customType: "tool_execution_start", timestamp: at(4, 30) },
	message(5, "toolResult", [{ type: "text", text: "User answers: …" }], {
		toolCallId: "ask-1",
		toolName: "ask",
		details: {
			results: [
				{
					id: "store",
					question: QUESTIONS[0].question,
					options: ["In memory", "Redis"],
					selectedOptions: ["Redis"],
				},
				{
					id: "ttl",
					question: QUESTIONS[1].question,
					options: ["30 seconds", "5 minutes"],
					selectedOptions: [],
					customInput: "1 minute, but never for logged-in users",
				},
			],
		},
	}),
	message(9, "assistant", [
		{
			type: "text",
			text: "Done: product pages are cached in Redis for 60 seconds and skipped when a session cookie is present. Tests pass.",
		},
	]),
	message(10, "user", "Thanks. Also log cache hits so we can see the hit rate."),
	message(10, "user", [{ type: "text", text: "Use the existing logger, not console.log." }]),
	message(12, "assistant", [{ type: "text", text: PLAN }]),
];

const jsonl = (entries: unknown[]) => `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`;

// The sample journal, another session sharing its id's start, and a long one for the page cap.
function writeJournals(root: string): void {
	const folder = path.join(root, PROJECT_FOLDER);
	mkdirSync(folder, { recursive: true });
	writeFileSync(path.join(folder, `2026-10-11T09-00-00-000Z_${ID}.jsonl`), jsonl(JOURNAL));
	writeFileSync(
		path.join(folder, "2026-10-11T08-30-00-000Z_01a2b3c4-9999-7aaa-8bbb-ccccdddd0000.jsonl"),
		jsonl([{ type: "title", title: "Fix checkout totals" }]),
	);
	const notes = Array.from({ length: 30 }, (_, i) =>
		message(i, "user", `Note ${i + 1}: ${"lorem ipsum ".repeat(120)}`),
	);
	const capId = "01a2c0de-0000-7000-8000-000000000001";
	mkdirSync(path.join(root, "-home-user-notes"));
	writeFileSync(
		path.join(root, "-home-user-notes", `2026-10-11T10-00-00-000Z_${capId}.jsonl`),
		jsonl([{ type: "session", id: capId, timestamp: at(0) }, ...notes]),
	);
}

/** The calls the template shows as boxes, by the name it gives each. */
const CALLS: Record<string, ReadParams> = {
	afterAgent: { session: SESSION, line: 10 },
	afterUser: { session: SESSION, line: 11 },
	firstMessage: { session: SESSION, line: 3 },
	askQuestion: { session: SESSION, line: 6 },
	askAnswer: { session: SESSION, line: 8 },
	otherEntry: { session: SESSION, line: 7 },
	pageWithDetails: { session: SESSION, line: 6, before: 2, thinking: true, tools: true },
	pageCut: { session: SESSION, line: 12, before: 1 },
	pageUser: { session: SESSION, user: true, after: 10 },
	findMatches: { session: SESSION, find: "cache" },
	findRaw: { session: SESSION, find: "Redis", raw: true },
	ambiguous: { session: "01a2b3c4", line: 1 },
};

/** The calls whose one-line errors the template shows in its errors table. */
const ERRORS: Record<string, ReadParams> = {
	noSession: { session: "01a9", line: 1 },
	pastEnd: { session: SESSION, line: 40 },
	userWithTools: { session: SESSION, user: true, tools: true, after: 3 },
	findWithBefore: { session: SESSION, find: "cache", before: 2 },
	nothingToRead: { session: SESSION },
};

/** A page past the 20,000-character cap; only its last three lines are shown. */
const CAPPED: ReadParams = { session: "01a2c0de", user: true, line: 16, before: 15, after: 15 };

/** A call as the template shows it. */
const callOf = (params: ReadParams) => `session_read ${JSON.stringify(params)}`;

function selfLine(parent?: string): string {
	const file = path.join(
		os.homedir(),
		".omp",
		"agent",
		"sessions",
		PROJECT_FOLDER,
		`2026-10-11T09-00-00-000Z_${ID}.jsonl`,
	);
	const sessionManager = {
		getSessionId: () => ID,
		getSessionFile: () => file,
		getHeader: () => ({ parentSession: parent }),
		getBranch: () => [],
	};
	return selfMessage({ agent: { kind: "main" }, sessionManager }) ?? "";
}

/** The values for templates/sessions.md; `root` is an empty folder for the sample journals. */
export async function sessionsValues(doc: Doc, root: string): Promise<Record<string, unknown>> {
	writeJournals(root);
	const read = (params: ReadParams) => doc.result(() => readSession(params, { roots: [root] }));
	const names = ["session", "line", "before", "after", "find", "user", "thinking", "tools", "raw"];
	const values: Record<string, unknown> = {
		toolDescription: doc.quote(templates.tool.render()),
		parameters: Object.fromEntries(names.map(name => [name, doc.cell(templates.tool.text(`parameters.${name}`))])),
		selfNew: doc.quote(selfLine()),
		selfForked: doc.quote(selfLine("01a2b3b0-1111-7222-8333-444455556666")),
	};
	for (const [name, params] of Object.entries(CALLS)) values[name] = doc.example(callOf(params), await read(params));
	for (const [name, params] of Object.entries(ERRORS)) values[name] = doc.cell(await read(params));
	const tail = (await read(CAPPED)).split("\n").slice(-3).join("\n");
	values.cappedPage = doc.example(callOf(CAPPED), tail);
	return values;
}
