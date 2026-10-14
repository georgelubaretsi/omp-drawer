// A made-up omp session for the "what the model sees" page (scenario.ts): a user asks for a cache
// on a slow endpoint, the agent looks at the code, asks two questions, finishes, then gets two
// follow-ups.

export const SAMPLE_ID = "01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b";

const at = (minute: number, second = 0) =>
	`2026-10-11T09:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`;

export const message = (minute: number, role: string, content: unknown, extra: Record<string, unknown> = {}) => ({
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

const ANSWERS = {
	results: [
		{ id: "store", question: QUESTIONS[0]?.question, options: ["In memory", "Redis"], selectedOptions: ["Redis"] },
		{
			id: "ttl",
			question: QUESTIONS[1]?.question,
			options: ["30 seconds", "5 minutes"],
			selectedOptions: [],
			customInput: "1 minute, but never for logged-in users",
		},
	],
};

/** The session's journal entries, one per line; `cwd` is the project's folder. */
export function sampleJournal(cwd: string): unknown[] {
	return [
		{ type: "session", id: SAMPLE_ID, timestamp: at(0), cwd },
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
			details: ANSWERS,
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
}
