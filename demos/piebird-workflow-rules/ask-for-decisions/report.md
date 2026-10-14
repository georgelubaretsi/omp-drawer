# piebird-workflow-rules/ask-for-decisions: what the agents did in its demo

`bun tools/demo/record.ts piebird-workflow-rules/ask-for-decisions` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Carts must survive a server restart, and next month we run several servers behind a load balancer. Plan it with me before any code. | 13 | 5 | 0 |

## omp: Carts must survive a server restart, and next month we run several servers behind a load balancer. Plan it with me before any code.

1. `glob`: Listing project files
2. `grep`: Finding cart storage code
3. `read`: Reading cart module
4. `read`: Reading server entry
5. `read`: Reading package manifest
