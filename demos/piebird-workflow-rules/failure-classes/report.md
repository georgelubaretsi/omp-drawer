# piebird-workflow-rules/failure-classes: what the agents did in its demo

`bun tools/demo/record.ts piebird-workflow-rules/failure-classes` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Before we release, check src/cart.ts against the failure classes. Report, don't fix. | 19 | 5 | 0 |

## omp: Before we release, check src/cart.ts against the failure classes. Report, don't fix.

1. `read`: Reading failure-classes skill
2. `read`: Reading cart module
3. `read`: Reading inputs failure class
4. `read`: Reading trust failure class
5. `read`: Reading resources failure class
