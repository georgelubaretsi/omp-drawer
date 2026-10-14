# piebird-workflow-rules: what the agents did in its demo

`bun tools/demo/record.ts piebird-workflow-rules` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | A gift card bigger than the cart makes the total negative. Fix it. | 18 | 7 | 0 |
| Claude Code | A gift card bigger than the cart makes the total negative. Fix it. | 14 | 7 | 0 |
| Codex | A gift card bigger than the cart makes the total negative. Fix it. | 81 | 4 | 0 |

## omp: A gift card bigger than the cart makes the total negative. Fix it.

1. `find`: Locating cart total calculation
2. `read`: Reading cart total logic
3. `grep`: Finding callers and tests of total
4. `edit`: Clamping total at zero
5. `read`: Checking changelog format
6. `edit`: Adding regression test and changelog entry
7. `bash`: Running cart tests

## Claude Code: A gift card bigger than the cart makes the total negative. Fix it.

1. `Bash`: Check repo state and search for gift card code
2. `Bash`: Read cart code, tests, and callers
3. `Bash`: Read changelog, README, and run existing tests
4. `Edit`: 
5. `Edit`: 
6. `Edit`: 
7. `Bash`: Run the test suite

## Codex: A gift card bigger than the cart makes the total negative. Fix it.

1. `exec`: text(await tools.exec_command({cmd:"pwd; rg --files -g 'AGENTS.md' -g '*gift*' -
2. `exec`: text(await tools.exec_command({cmd:"rg --files --hidden -g '!node_modules' -g '!
3. `exec`: text(await tools.exec_command({cmd:"cat src/server.ts CHANGELOG.md; for f in /AG
4. `exec`: text(await tools.apply_patch("*** Begin Patch\n*** Update File: /private/tmp/omp
