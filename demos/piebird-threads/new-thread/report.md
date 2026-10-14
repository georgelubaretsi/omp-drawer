# piebird-threads/new-thread: what the agents did in its demo

`bun tools/demo/record.ts piebird-threads/new-thread` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Let's park coupons for now. Decided so far: at most two coupons per order. Still open for me: can a coupon apply to shipping? Keep a thread so we pick it up later. | 8 | 4 | 0 |
| omp | What's waiting on me? | 2 | 0 | 0 |

## omp: Let's park coupons for now. Decided so far: at most two coupons per order. Still open for me: can a coupon apply to shipping? Keep a thread so we pick it up later.

1. `read`: Reading threads skill
2. `bash`: Checking thread folder setting
3. `write`: Creating coupons thread
4. `bash`: Committing coupons thread

## omp: What's waiting on me?

No tool calls.
