# piebird-tern-bridge/tabs: what the agents did in its demo

`bun tools/demo/record.ts piebird-tern-bridge/tabs` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Open src/cart.ts in a new tab, name that tab cart, then show this tab again. | 17 | 4 | 0 |

## omp: Open src/cart.ts in a new tab, name that tab cart, then show this tab again.

1. `read`: Reading Tern skill for tab control
2. `bash`: Reading my Tern pane id
3. `tern_lua`: Opening src/cart.ts in a new tab
4. `tern_lua`: Naming new tab cart and refocusing this tab
