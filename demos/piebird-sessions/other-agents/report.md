# piebird-sessions/other-agents: what the agents did in its demo

`bun tools/demo/record.ts piebird-sessions/other-agents` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | I worked on this project in Claude Code and in Codex. What did I decide in each? | 17 | 6 | 0 |

## omp: I worked on this project in Claude Code and in Codex. What did I decide in each?

1. `session_read`: Listing project sessions across agents
2. `bash`: Locating Claude Code and Codex session journals
3. `session_read`: Reading Claude Code session decisions
4. `session_read`: Reading Codex session decisions
5. `session_read`: Reading full Claude Code session
6. `session_read`: Reading full Codex session
