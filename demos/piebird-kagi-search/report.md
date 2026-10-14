# piebird-kagi-search: what the agents did in its demo

`bun tools/demo/record.ts piebird-kagi-search` writes this page with each recording, from the demo's session journals. omp and Claude Code run on Claude Haiku 5.5, Codex on gpt-6.1-sol. Each prompt the demo sends, with the tool calls the agent made for it and the intent it gave each one (Codex gives none: its call's arguments stand in).

A failed call, or calls the task didn't need, mean the agent stumbled on something the plugin should have told it: fix the skill, rule, tool description or error text, then record again. Fewer calls and no failures is the goal.

| Agent | Prompt | Seconds | Tool calls | Failed |
| --- | --- | --- | --- | --- |
| omp | What's the latest Bun release, and what changed in it? Search the web. | 15 | 3 | 0 |
| Claude Code | What's the latest Bun release, and what changed in it? Search the web. | 26 | 4 | 0 |
| Codex | What's the latest Bun release, and what changed in it? Search the web. | 35 | 4 | 0 |

## omp: What's the latest Bun release, and what changed in it? Search the web.

1. `kagi_search`: Searching latest Bun release
2. `kagi_quick`: Quick answer on latest Bun release
3. `read`: Reading Bun v1.4.3 release post

## Claude Code: What's the latest Bun release, and what changed in it? Search the web.

1. `mcp__piebird-kagi-search__kagi_search`: 
2. `mcp__piebird-kagi-search__kagi_search`: 
3. `ToolSearch`: 
4. `WebFetch`: 

## Codex: What's the latest Bun release, and what changed in it? Search the web.

1. `exec`: text(await tools.exec_command({cmd:"cat /private/tmp/omp-demo-SHxp2x/codex/plugi
2. `exec`: text(await tools.mcp__piebird_kagi_search__kagi_search({query:"Bun latest releas
3. `exec`: text(await tools.web__run({open:[{ref_id:"https://bun.sh/blog/bun-v1.4.3"},{ref_
4. `exec`: text(await tools.web__run({find:[{ref_id:"turn0view0",pattern:"76"},{ref_id:"tur
