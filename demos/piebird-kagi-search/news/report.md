# piebird-kagi-search/news: what the agents did in its demo

`bun tools/demo/record.ts piebird-kagi-search/news` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | What are today's top technology stories on Kagi News? Three, one line each. | 9 | 3 | 0 |

## omp: What are today's top technology stories on Kagi News? Three, one line each.

1. `read`: Reading Kagi News categories docs
2. `read`: Reading Kagi News docs
3. `write`: Fetching today's Technology stories from Kagi News
