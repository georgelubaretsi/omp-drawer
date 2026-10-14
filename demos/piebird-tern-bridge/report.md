# piebird-tern-bridge: what the agents did in its demo

`bun tools/demo/record.ts piebird-tern-bridge` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Open README.md beside this pane, keep focus here | 11 | 3 | 0 |
| omp | Close the README pane | 10 | 2 | 0 |
| omp | Start a Tern agent beside me and ask it which files are in src. Wait for it, then tell me its answer. | 11 | 2 | 0 |

## omp: Open README.md beside this pane, keep focus here

1. `read`: Reading Tern skill before pane action
2. `bash`: Reading current Tern pane id
3. `tern_lua`: Opening README.md beside pane, keeping focus

## omp: Close the README pane

1. `tern_lua`: Listing panes to find README pane
2. `tern_lua`: Closing README pane 7

## omp: Start a Tern agent beside me and ask it which files are in src. Wait for it, then tell me its answer.

1. `tern_lua`: Starting Tern agent beside pane to list src files
2. `tern_lua`: Returning focus and waiting for agent in pane 9
