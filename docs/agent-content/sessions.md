# sessions: what agents receive

Each tinted box, and each cell under "What the agent gets", is exactly what the agent receives; everything else is a note. The sample session: a user asks for a cache on a slow endpoint, the agent looks at the code, asks two questions, finishes, then gets two follow-ups.

**Contents:** [Tool](#tool) · [A line alone](#a-line-alone) · [A page](#a-page) · [A search](#a-search) · [Errors](#errors) · [Its own session](#its-own-session) · [All plugins](index.md)

## Tool

**Description**, sent in every model request:

> [!NOTE]
> Read an omp session journal (.jsonl) by session id, id prefix or path, and line. Read-only: it changes nothing. With only a line: that entry and what it relates to (the agent text a user's message answered, an ask with its options and what was picked or typed). before/after page by messages around the line (tool entries only with tools); find searches the session (from line when given); user keeps only the user's words; thinking/tools add the agent's thinking and tool calls; raw returns the exact journal lines (JSONL). The output ends with the next call to make. Use it to read, check or page through a session instead of opening the journal file, whose lines run to tens of thousands of characters.
>
> For filtering it doesn't do (by role, tool, time, field, or across sessions), run jq or python over the journal file. A call with only a line prints the journal's path first; journals are under \~/.omp/agent/sessions/, one folder per project, named \`\<time\>\_\<session id\>.jsonl\`. Each line is one JSON entry with \`type\` and \`timestamp\`. A message entry (\`type\` "message") has \`message.role\` ("user", "assistant", "toolResult", "developer") and \`message.content\`: a string, or a list of blocks of type "text" (\`text\`), "thinking" (\`thinking\`), "toolCall" (\`name\`, \`arguments\`) or "image"; a tool result also has \`message.toolName\`. Print only the fields you need, never whole lines, e.g. \`jq -c 'select(.message.role == "user") \| \[.timestamp, .message.content\]' \<journal\>\`.

**Parameters**, sent with it:

| Parameter | What the agent gets |
| --- | --- |
| `session` | Session id, id prefix (13+ characters avoid collisions) or .jsonl path |
| `line` | 1-based journal line |
| `before` | Messages to show before the line |
| `after` | Messages to show after the line (from the start when no line) |
| `find` | Case-insensitive text to search for |
| `user` | Only the user's messages and ask answers |
| `thinking` | Include the agent's thinking |
| `tools` | Include tool calls and results |
| `raw` | Return exact journal lines instead of readable text |

## A line alone

**When:** the agent calls `session_read` with only `session` and `line`.

**A user's message after the agent's text.** Call: `session_read {"session":"01a2b3c4-5d6e","line":10}`

> [!NOTE]
> /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl\
> line 10 · user message · 2026-10-11T09:10:00.000Z\
> Thanks. Also log cache hits so we can see the hit rate.
>
> answers line 9 · assistant · 2026-10-11T09:09:00.000Z\
> Done: product pages are cached in Redis for 60 seconds and skipped when a session cookie is present. Tests pass.\
> around: session\_read {"session":"01a2b3c4-5d6e","line":10,"before":5,"after":5}

**A user's message after the user's own message.** Call: `session_read {"session":"01a2b3c4-5d6e","line":11}`

> [!NOTE]
> /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl\
> line 11 · user message · 2026-10-11T09:10:00.000Z\
> Use the existing logger, not console.log.
>
> follows line 10 · user message · 2026-10-11T09:10:00.000Z\
> Thanks. Also log cache hits so we can see the hit rate.\
> around: session\_read {"session":"01a2b3c4-5d6e","line":11,"before":5,"after":5}

**The first message, with nothing before it.** Call: `session_read {"session":"01a2b3c4-5d6e","line":3}`

> [!NOTE]
> /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl\
> line 3 · user message · 2026-10-11T09:01:00.000Z\
> The /products endpoint is slow. Can you add a cache?
>
> answers: no message with text before it\
> around: session\_read {"session":"01a2b3c4-5d6e","line":3,"before":5,"after":5}

**The agent's ask, with its answer.** Call: `session_read {"session":"01a2b3c4-5d6e","line":6}`

> [!NOTE]
> /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl\
> line 6 · ask question · 2026-10-11T09:04:00.000Z\
> Every request hits the database. Two choices before I write it:\
> store: Where should the cache live?\
>   \- In memory: fastest, lost on restart\
>   \- Redis: shared across instances\
>   picked: Redis\
> ttl: How long may a cached page be stale?\
>   \- 30 seconds\
>   \- 5 minutes\
>   typed: "1 minute, but never for logged-in users"\
> answered on line 8 · 2026-10-11T09:05:00.000Z\
> around: session\_read {"session":"01a2b3c4-5d6e","line":6,"before":5,"after":5}

**The answer to that ask.** Call: `session_read {"session":"01a2b3c4-5d6e","line":8}`

> [!NOTE]
> /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl\
> line 8 · ask answer · 2026-10-11T09:05:00.000Z\
> answers line 6 · ask question · 2026-10-11T09:04:00.000Z\
> store: Where should the cache live?\
>   \- In memory: fastest, lost on restart\
>   \- Redis: shared across instances\
>   picked: Redis\
> ttl: How long may a cached page be stale?\
>   \- 30 seconds\
>   \- 5 minutes\
>   typed: "1 minute, but never for logged-in users"\
> around: session\_read {"session":"01a2b3c4-5d6e","line":8,"before":5,"after":5}

**An entry of another kind.** Call: `session_read {"session":"01a2b3c4-5d6e","line":7}`

> [!NOTE]
> /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl\
> line 7 · other (tool\_execution\_start) · 2026-10-11T09:04:30.000Z
>
> around: session\_read {"session":"01a2b3c4-5d6e","line":7,"before":5,"after":5}

## A page

**When:** the agent calls `session_read` with `before`, `after`, `user`, `thinking`, `tools` or `raw`.

**With thinking and tools.** Call: `session_read {"session":"01a2b3c4-5d6e","line":6,"before":2,"thinking":true,"tools":true}`

> [!NOTE]
> line 4 · assistant · 2026-10-11T09:02:00.000Z\
> \[thinking\] The handler queries Postgres on every request; a read-through cache keyed by the query string should do.\
> Let me look at how the handler fetches products.\
> \[tool call\] bash {"command":"rg -n \\"getProducts\\" src"}
>
> line 5 · tool result (bash) · 2026-10-11T09:03:00.000Z\
> src/routes/products.ts:12:  const rows = await getProducts(db, query);\
> src/db/products.ts:4:export async function getProducts(db, query) {
>
> line 6 · assistant · 2026-10-11T09:04:00.000Z\
> Every request hits the database. Two choices before I write it:\
> \[ask\]\
> store: Where should the cache live?\
>   \- In memory: fastest, lost on restart\
>   \- Redis: shared across instances\
> ttl: How long may a cached page be stale?\
>   \- 30 seconds\
>   \- 5 minutes\
> lines 4–6 · 3 entries\
> earlier: session\_read {"session":"01a2b3c4-5d6e","line":4,"before":2,"thinking":true,"tools":true} · later: session\_read {"session":"01a2b3c4-5d6e","line":6,"after":2,"thinking":true,"tools":true}

**A message over 1,500 characters, cut in the middle.** Call: `session_read {"session":"01a2b3c4-5d6e","line":12,"before":1}`

> [!NOTE]
> line 11 · user message · 2026-10-11T09:10:00.000Z\
> Use the existing logger, not console.log.
>
> line 12 · assistant · 2026-10-11T09:12:00.000Z\
> Here is the plan for logging cache hits.\
> \1. In src/cache/products.ts, the read-through wrapper already knows whether a key was found; it will call logger.info with the event name cache.products, the outcome (hit or miss), the key's length rather than the key itself, and the time the lookup took in milliseconds.\
> \2. The existing logger in src/log.ts writes JSON lines, so the hit rate can be read with the same query the dashboard uses for request latency: count hits and misses per minute and divide.\
> \3. Misses that fall through to Postgres keep their current span, so the slow path stays visible in traces; hits get no span, because they take under a millisecond and would only add noise.\
> \4. Logged-in requests skip the cache entirely, so they log \
> … \[122 characters left out\] …\
> ducts.test.ts will stub the logger and check one hit and one miss are logged with the right fields.\
> \6. No new dependency is needed, and the log volume is one line per request to /products, which the current retention handles: the busiest hour last week had about 40,000 requests.\
> \7. The dashboard gets a new panel, Products cache hit rate, next to the latency panel, with the same one-minute buckets and a 24-hour window by default.\
> \8. If the hit rate stays under 50% for an hour, the existing alert channel gets a warning, because that usually means the cache key includes something that changes on every request, such as a tracking parameter.\
> If you want the key itself in the log for debugging, I can add it behind the LOG\_CACHE\_KEYS flag instead.\
> lines 11–12 · 2 entries\
> earlier: session\_read {"session":"01a2b3c4-5d6e","line":11,"before":1} · later: end of session (12 lines)

**Only the user's words, from the start.** Call: `session_read {"session":"01a2b3c4-5d6e","user":true,"after":10}`

> [!NOTE]
> line 3 · user message · 2026-10-11T09:01:00.000Z\
> The /products endpoint is slow. Can you add a cache?
>
> line 8 · ask answer · 2026-10-11T09:05:00.000Z\
> store: Where should the cache live?\
>   \- In memory: fastest, lost on restart\
>   \- Redis: shared across instances\
>   picked: Redis\
> ttl: How long may a cached page be stale?\
>   \- 30 seconds\
>   \- 5 minutes\
>   typed: "1 minute, but never for logged-in users"
>
> line 10 · user message · 2026-10-11T09:10:00.000Z\
> Thanks. Also log cache hits so we can see the hit rate.
>
> line 11 · user message · 2026-10-11T09:10:00.000Z\
> Use the existing logger, not console.log.\
> lines 3–11 · 4 entries\
> earlier: start of session · later: end of session (12 lines)

## A search

**When:** the agent calls `session_read` with `find`.

**Matches.** Call: `session_read {"session":"01a2b3c4-5d6e","find":"cache"}`

> [!NOTE]
> line 3 · user message · 2026-10-11T09:01:00.000Z\
> The /products endpoint is slow. Can you add a cache?
>
> line 6 · assistant · 2026-10-11T09:04:00.000Z\
> Every request hits the database. Two choices before I write it: \[ask\] store: Where should the cache live? - In memory: fastest, lost on restart - Redis: shared across instances ttl: How long may a cached page be sta…
>
> line 8 · ask answer · 2026-10-11T09:05:00.000Z\
> store: Where should the cache live? - In memory: fastest, lost on restart - Redis: shared across instances picked: Redis ttl: How long may a ca…
>
> line 9 · assistant · 2026-10-11T09:09:00.000Z\
> Done: product pages are cached in Redis for 60 seconds and skipped when a session cookie is present. Tests pass.
>
> line 10 · user message · 2026-10-11T09:10:00.000Z\
> Thanks. Also log cache hits so we can see the hit rate.
>
> line 12 · assistant · 2026-10-11T09:12:00.000Z\
> Here is the plan for logging cache hits. 1. In src/cache/products.ts, the read-through wrapper already knows whether a key was found; it will call logger.…\
> 6 matches\
> read one: session\_read {"session":"01a2b3c4-5d6e","line":3,"before":3,"after":3}

**With `raw`, the journal lines as written.** Call: `session_read {"session":"01a2b3c4-5d6e","find":"Redis","raw":true}`

> [!NOTE]
> {"type":"message","timestamp":"2026-10-11T09:04:00.000Z","message":{"role":"assistant","content":\[{"type":"text","text":"Every request hits the database. Two choices before I write it:"},{"type":"toolCall","id":"ask-1","name":"ask","arguments":{"questions":\[{"id":"store","question":"Where should the cache live?","options":\[{"label":"In memory","description":"fastest, lost on restart"},{"label":"Redis","description":"shared across instances"}\]},{"id":"ttl","question":"How long may a cached page be stale?","options":\[{"label":"30 seconds"},{"label":"5 minutes"}\]}\]}}\]}}\
> {"type":"message","timestamp":"2026-10-11T09:05:00.000Z","message":{"role":"toolResult","content":\[{"type":"text","text":"User answers: …"}\],"toolCallId":"ask-1","toolName":"ask","details":{"results":\[{"id":"store","question":"Where should the cache live?","options":\["In memory","Redis"\],"selectedOptions":\["Redis"\]},{"id":"ttl","question":"How long may a cached page be stale?","options":\["30 seconds","5 minutes"\],"selectedOptions":\[\],"customInput":"1 minute, but never for logged-in users"}\]}}}\
> {"type":"message","timestamp":"2026-10-11T09:09:00.000Z","message":{"role":"assistant","content":\[{"type":"text","text":"Done: product pages are cached in Redis for 60 seconds and skipped when a session cookie is present. Tests pass."}\]}}\
> 3 matches\
> read one: session\_read {"session":"01a2b3c4-5d6e","line":6,"before":3,"after":3,"raw":true}

## Errors

**When:** a call fails; the agent gets the error message.

| When | What the agent gets |
| --- | --- |
| No session matches the id | session 01a9 is not in /home/user/.omp/agent/sessions |
| The line is past the journal's end | /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl has 12 lines |
| `user` with `thinking` or `tools` | user shows only the user's words: leave out thinking and tools |
| `find` with `before` or `after` | find searches from line (or the start); it takes no before or after |
| No `line`, no `find`, and no `after` on its own | give a line, find, or after alone (read from the start) |

**Several sessions match the id.** Call: `session_read {"session":"01a2b3c4","line":1}`

> [!NOTE]
> session 01a2b3c4 matches 2 sessions; give a longer id:\
>   /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T08-30-00-000Z\_01a2b3c4-9999-7aaa-8bbb-ccccdddd0000.jsonl — Fix checkout totals\
>   /home/user/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl — Add a response cache

**A page that hit the 20,000-character cap** ends with these lines; above them come the entries that fit. Call: `session_read {"session":"01a2c0de","user":true,"line":16,"before":15,"after":15}`

> [!NOTE]
> lines 10–22 · 13 entries\
> page cap of 20000 characters: left out 8 earlier entries (lines 2–9) and 9 later entries (lines 23–31)\
> earlier: session\_read {"session":"01a2c0de","line":10,"before":15,"user":true} · later: session\_read {"session":"01a2c0de","line":22,"after":15,"user":true}

## Its own session

**When:** before the main agent's turn after a user prompt, when it changed (first prompt, fork, new journal, after a compaction). The model gets it as a `developer` message; you see it in the chat (in omp's own UI, a card headed `sessions.self`).

**A new session:**

> [!NOTE]
> This session: 01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b (\~/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl)

**A forked session:**

> [!NOTE]
> This session: 01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b (\~/.omp/agent/sessions/-home-user-shop-api/2026-10-11T09-00-00-000Z\_01a2b3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b.jsonl), forked from 01a2b3b0-1111-7222-8333-444455556666
