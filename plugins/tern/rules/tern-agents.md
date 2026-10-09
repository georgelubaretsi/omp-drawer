---
description: In Tern, read the tern skill first, and keep omp subagents apart from Tern agents in panes
alwaysApply: true
---
# Tern

- In Tern (`TERM_PROGRAM=tern`), read the `tern` skill before working with panes, tabs, sessions, Tern agents or Tern blocks; use `tern_lua` and the `tern` CLI for them.
- Two different things are called agents; keep them apart:
  - **Subagents**: omp's own `task` tool (and eval `agent()`/`workpool`). Work delegated inside this session; results return to you; no pane. The default for delegating work, in Tern or not.
  - **Tern agents**: separate omp sessions in their own Tern panes (`cx.agents`), visible to the user, who can talk to them; they keep running after your turn. Start one only when the user asks for an agent in a pane, split or tab, or to work with agents already open in Tern.
