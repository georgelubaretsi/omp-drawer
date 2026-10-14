# piebird-sessions: what the agents did in its demo

`bun tools/demo/record.ts piebird-sessions` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | What did I decide about the cart cache in my previous session here? | 7 | 2 | 0 |
| omp | Quote my exact words from it, with the session and line. | 4 | 0 | 0 |
| Claude Code | What did I decide about the cart cache in my previous session here? | 13 | 3 | 0 |
| Codex | What did I decide about the cart cache in my previous session here? | 26 | 4 | 0 |

## omp: What did I decide about the cart cache in my previous session here?

1. `session_read`: Listing this project's previous sessions
2. `session_read`: Reading the prior session's user messages about cart cache

## omp: Quote my exact words from it, with the session and line.

No tool calls.

## Claude Code: What did I decide about the cart cache in my previous session here?

1. `mcp__piebird-sessions__session_read`: 
2. `mcp__piebird-sessions__session_read`: 
3. `mcp__piebird-sessions__session_read`: 

## Codex: What did I decide about the cart cache in my previous session here?

1. `exec`: text(ALL_TOOLS.filter(x=>/search|session|history|memory/i.test(x.name+" "+x.desc
2. `exec`: text(ALL_TOOLS.find(x=>/piebird_sessions__session_read/.test(x.name)));
3. `exec`: text(await tools.mcp__piebird_sessions__session_read({}));
4. `exec`: text(await tools.mcp__piebird_sessions__session_read({session:"01a13458-7b19-763
