# piebird-workflow-rules: what the agents did in its demo

`bun tools/demo/record.ts piebird-workflow-rules` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | A gift card bigger than the cart makes the total negative. Fix it. | 14 | 4 | 0 |
| Claude Code | A gift card bigger than the cart makes the total negative. Fix it. | 17 | 7 | 0 |
| Codex | A gift card bigger than the cart makes the total negative. Fix it. | 29 | 4 | 0 |

## omp: A gift card bigger than the cart makes the total negative. Fix it.

1. `grep`: Locating gift card logic
2. `read`: Reading cart total logic
3. `edit`: Clamping total at zero
4. `bash`: Running cart tests

## Claude Code: A gift card bigger than the cart makes the total negative. Fix it.

1. `Bash`: Show repo status, recent commits, and file list
2. `Bash`: Search repo for gift card references
3. `Bash`: Read cart code, tests, changelog, and related references
4. `Edit`: 
5. `Edit`: 
6. `Edit`: 
7. `Bash`: Run the test suite with bun and show diff stats

## Codex: A gift card bigger than the cart makes the total negative. Fix it.

1. `exec`: text(await tools.exec_command({cmd:"pwd; rg --files -g 'AGENTS.md' -g '*gift*' -
2. `exec`: text(await tools.exec_command({cmd:"rg --files -g 'AGENTS.md' -g '!node_modules'
3. `exec`: text(await tools.exec_command({cmd:"ls -la; for p in /AGENTS.md /private/AGENTS.
4. `exec`: text(await tools.exec_command({cmd:"cat README.md CHANGELOG.md; git diff --check
