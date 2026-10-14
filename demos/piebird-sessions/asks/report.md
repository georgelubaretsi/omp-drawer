# piebird-sessions/asks: what the agents did in its demo

`bun tools/demo/record.ts piebird-sessions/asks` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | When you added the products cache, you asked me two questions. What were the options, and what did I answer? | 10 | 3 | 0 |
| omp | Now only my own messages from that session, word for word. | 5 | 1 | 0 |

## omp: When you added the products cache, you asked me two questions. What were the options, and what did I answer?

1. `session_read`: Listing sessions for products cache questions
2. `session_read`: Finding questions asked during cache work
3. `session_read`: Reading cache session transcript with tool calls

## omp: Now only my own messages from that session, word for word.

1. `session_read`: Pulling only user messages and ask answers
