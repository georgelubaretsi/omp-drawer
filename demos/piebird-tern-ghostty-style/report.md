# piebird-tern-ghostty-style: what the agents did in its demo

`bun tools/demo/record.ts piebird-tern-ghostty-style` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Run bun test, then make shipping() in src/cart.ts never return less than zero. | 6 | 4 | 0 |

## omp: Run bun test, then make shipping() in src/cart.ts never return less than zero.

1. `bash`: Running bun test baseline
2. `grep`: Locating shipping function
3. `edit`: Clamping shipping to non-negative
4. `bash`: Re-running bun test after change
