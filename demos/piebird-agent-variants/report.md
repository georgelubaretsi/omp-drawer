# piebird-agent-variants: what the agents did in its demo

`bun tools/demo/record.ts piebird-agent-variants` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Have the reviewer agent check src/cart.ts, running on Claude Haiku. | 27 | 5 | 0 |

## omp: Have the reviewer agent check src/cart.ts, running on Claude Haiku.

1. `agent_variant_setup`: Setting up Haiku reviewer variant
2. `bash`: Checking repo instructions and status for .omp writes
3. `agent_variant_setup`: Setting up Haiku reviewer variant
4. `task`: Reviewing src/cart.ts on Haiku
5. `wait`: Waiting for Haiku cart review
