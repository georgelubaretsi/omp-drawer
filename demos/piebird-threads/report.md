# piebird-threads: what the agents did in its demo

`bun tools/demo/record.ts piebird-threads` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | What's waiting on me? | 10 | 4 | 0 |
| omp | Round to the nearest cent. Record that in the thread. | 9 | 2 | 0 |
| omp | Anything else waiting on me? | 5 | 0 | 0 |
| Claude Code | What's waiting on me? | 10 | 3 | 0 |
| Codex | What's waiting on me? Check the project's threads. | 38 | 3 | 0 |

## omp: What's waiting on me?

1. `read`: Reading threads skill
2. `read`: Listing thread files
3. `read`: Reading checkout-totals thread
4. `read`: Reading cart-cache thread

## omp: Round to the nearest cent. Record that in the thread.

1. `edit`: Recording rounding decision in checkout-totals thread
2. `bash`: Committing thread update

## omp: Anything else waiting on me?

No tool calls.

## Claude Code: What's waiting on me?

1. `Skill`: 
2. `Bash`: List thread files, read them, and check git status
3. `Bash`: Check whether discount rounding exists in src/cart.ts

## Codex: What's waiting on me? Check the project's threads.

1. `exec`: text(await tools.exec_command({cmd:"cat /private/tmp/omp-demo-gpIjtC/codex/plugi
2. `exec`: const results=await Promise.allSettled([
3. `exec`: text(await tools.exec_command({cmd:"cat src/cart.ts README.md package.json; git 
