# piebird-agent-variants/guards: what the agents did in its demo

`bun tools/demo/record.ts piebird-agent-variants/guards` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Have the reviewer agent check src/cart.ts, running on Claude Haiku, my Claude subscription. | 11 | 2 | 0 |
| omp | That change is mine and it's good: commit .omp/config.yml as 'smol role', then try again. | 18 | 4 | 0 |

## omp: Have the reviewer agent check src/cart.ts, running on Claude Haiku, my Claude subscription.

1. `agent_variant_setup`: Configuring Haiku reviewer variant
2. `bash`: Checking repo instructions and .omp status

## omp: That change is mine and it's good: commit .omp/config.yml as 'smol role', then try again.

1. `bash`: Committing .omp/config.yml
2. `agent_variant_setup`: Configuring Haiku reviewer variant
3. `task`: Reviewing src/cart.ts with Haiku
4. `wait`: Waiting for cart.ts review
