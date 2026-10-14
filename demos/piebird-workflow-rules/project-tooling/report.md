# piebird-workflow-rules/project-tooling: what the agents did in its demo

`bun tools/demo/record.ts piebird-workflow-rules/project-tooling` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | Check the project before I push. | 24 | 8 | 0 |

## omp: Check the project before I push.

1. `bash`: Checking git status and project layout
2. `glob`: Finding project config and task files
3. `read`: Reading package scripts
4. `read`: Reading changelog
5. `read`: Reading README
6. `bash`: Running project check script
7. `bash`: Checking git changes, types, and source
8. `bash`: Checking for lockfile and ignored artifacts
