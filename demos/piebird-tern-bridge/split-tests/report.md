# piebird-tern-bridge/split-tests: what the agents did in its demo

`bun tools/demo/record.ts piebird-tern-bridge/split-tests` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Split a pane below this one and run bun test there. Keep the focus here. | 11 | 3 | 0 |
| omp | Close the test pane you opened. | 3 | 1 | 0 |

## omp: Split a pane below this one and run bun test there. Keep the focus here.

1. `read`: Reading Tern skill before pane work
2. `bash`: Reading current pane id
3. `tern_lua`: Splitting pane below and running bun test

## omp: Close the test pane you opened.

1. `tern_lua`: Closing test pane 7
