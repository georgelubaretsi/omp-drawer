# piebird-kagi-search/small-web: what the agents did in its demo

`bun tools/demo/record.ts piebird-kagi-search/small-web` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Show me five of the newest posts on Kagi's Small Web feed. | 6 | 2 | 0 |

## omp: Show me five of the newest posts on Kagi's Small Web feed.

1. `read`: Reading Small Web feed docs
2. `write`: Fetching five newest Small Web posts
