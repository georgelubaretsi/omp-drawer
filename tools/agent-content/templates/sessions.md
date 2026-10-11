# sessions: what agents receive

Each tinted box, and each cell under "What the agent gets", is exactly what the agent receives; everything else is a note. The sample session: a user asks for a cache on a slow endpoint, the agent looks at the code, asks two questions, finishes, then gets two follow-ups.

**Contents:** [Tool](#tool) · [A line alone](#a-line-alone) · [A page](#a-page) · [A search](#a-search) · [Errors](#errors) · [Its own session](#its-own-session) · [All plugins](index.md)

## Tool

**Description**, sent in every model request:

{{toolDescription}}

**Parameters**, sent with it:

| Parameter | What the agent gets |
| --- | --- |
| `session` | {{parameters.session}} |
| `line` | {{parameters.line}} |
| `before` | {{parameters.before}} |
| `after` | {{parameters.after}} |
| `find` | {{parameters.find}} |
| `user` | {{parameters.user}} |
| `thinking` | {{parameters.thinking}} |
| `tools` | {{parameters.tools}} |
| `raw` | {{parameters.raw}} |

## A line alone

**When:** the agent calls `session_read` with only `session` and `line`.

**A user's message after the agent's text.** Call: `{{afterAgent.call}}`

{{afterAgent.output}}

**A user's message after the user's own message.** Call: `{{afterUser.call}}`

{{afterUser.output}}

**The first message, with nothing before it.** Call: `{{firstMessage.call}}`

{{firstMessage.output}}

**The agent's ask, with its answer.** Call: `{{askQuestion.call}}`

{{askQuestion.output}}

**The answer to that ask.** Call: `{{askAnswer.call}}`

{{askAnswer.output}}

**An entry of another kind.** Call: `{{otherEntry.call}}`

{{otherEntry.output}}

## A page

**When:** the agent calls `session_read` with `before`, `after`, `user`, `thinking`, `tools` or `raw`.

**With thinking and tools.** Call: `{{pageWithDetails.call}}`

{{pageWithDetails.output}}

**A message over 1,500 characters, cut in the middle.** Call: `{{pageCut.call}}`

{{pageCut.output}}

**Only the user's words, from the start.** Call: `{{pageUser.call}}`

{{pageUser.output}}

## A search

**When:** the agent calls `session_read` with `find`.

**Matches.** Call: `{{findMatches.call}}`

{{findMatches.output}}

**With `raw`, the journal lines as written.** Call: `{{findRaw.call}}`

{{findRaw.output}}

## Errors

**When:** a call fails; the agent gets the error message.

| When | What the agent gets |
| --- | --- |
| No session matches the id | {{noSession}} |
| The line is past the journal's end | {{pastEnd}} |
| `user` with `thinking` or `tools` | {{userWithTools}} |
| `find` with `before` or `after` | {{findWithBefore}} |
| No `line`, no `find`, and no `after` on its own | {{nothingToRead}} |

**Several sessions match the id.** Call: `{{ambiguous.call}}`

{{ambiguous.output}}

**A page that hit the 20,000-character cap** ends with these lines; above them come the entries that fit. Call: `{{cappedPage.call}}`

{{cappedPage.output}}

## Its own session

**When:** before the main agent's turn after a user prompt, when it changed (first prompt, fork, new journal, after a compaction). The model gets it as a `developer` message; you see it in the chat (in omp's own UI, a card headed `sessions.self`).

**A new session:**

{{selfNew}}

**A forked session:**

{{selfForked}}
