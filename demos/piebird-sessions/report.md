# piebird-sessions: what the agents did in its demo

`bun tools/demo/record.ts piebird-sessions` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | What did I decide about the cart cache in my previous session here? | 8 | 2 | 0 |
| omp | Quote my exact words from it, with the session and line. | 4 | 0 | 0 |
| Claude Code | What did I decide about the cart cache in my previous session here? | 8 | 2 | 0 |
| Codex | What did I decide about the cart cache in my previous session here? | 16 | 3 | 0 |

## omp: What did I decide about the cart cache in my previous session here?

1. `session_read`: Listing sessions for this project
2. `session_read`: Reading prior session's user messages about cart cache

## omp: Quote my exact words from it, with the session and line.

No tool calls.

## Claude Code: What did I decide about the cart cache in my previous session here?

1. `mcp__piebird-sessions__session_read`: 
2. `mcp__piebird-sessions__session_read`: 

## Codex: What did I decide about the cart cache in my previous session here?

1. `exec`: const ts = ALL_TOOLS.filter(x=>/search|history|session|memory/i.test(x.name+" "+
2. `exec`: text(await tools.mcp__piebird_sessions__session_read({find:"cart"}));
3. `exec`: text(await tools.mcp__piebird_sessions__session_read({session:"01a138e5-9bc4-71b
