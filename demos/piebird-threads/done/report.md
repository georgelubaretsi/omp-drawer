# piebird-threads/done: what the agents did in its demo

`bun tools/demo/record.ts piebird-threads/done` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Shipping stops at zero. Make it so, with a test, and since that settles the shipping coupons thread, close it. | 14 | 7 | 0 |
| omp | Anything still waiting on me? | 5 | 1 | 0 |

## omp: Shipping stops at zero. Make it so, with a test, and since that settles the shipping coupons thread, close it.

1. `read`: Reading threads skill
2. `read`: Reading shipping-coupons thread
3. `grep`: Finding shipping logic and tests
4. `edit`: Clamp shipping at zero
5. `edit`: Adding zero-floor test
6. `bash`: Running cart tests
7. `bash`: Moving thread to done and committing

## omp: Anything still waiting on me?

1. `glob`: Checking for open threads
