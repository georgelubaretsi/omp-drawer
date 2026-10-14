# piebird-threads/stale: what the agents did in its demo

`bun tools/demo/record.ts piebird-threads/stale` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Which threads are open? | 12 | 5 | 0 |

## omp: Which threads are open?

1. `read`: Reading threads skill
2. `bash`: Locating threads folder and settings
3. `read`: Reading product-search thread
4. `read`: Reading refunds thread
5. `bash`: Checking last commit per thread
