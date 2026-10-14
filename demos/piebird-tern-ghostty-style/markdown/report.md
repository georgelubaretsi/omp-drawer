# piebird-tern-ghostty-style/markdown: what the agents did in its demo

`bun tools/demo/record.ts piebird-tern-ghostty-style/markdown` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Open docs/shipping.md rendered in a new tab, and show that tab. | 18 | 3 | 0 |

## omp: Open docs/shipping.md rendered in a new tab, and show that tab.

1. `read`: Reading Tern skill
2. `tern_lua`: Opening shipping.md rendered in new tab
3. `tern_lua`: Verifying shipping.md tab is open and focused
