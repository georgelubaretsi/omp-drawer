---
plugin: Tern
label: Tern Lua
parameters:
  code: "Luau chunk; `cx`, `state` and `print` are in scope; `return` the value you want back"
  timeout: "Seconds to wait for the answer (default {{defaultSeconds}}, max {{maxSeconds}})"
---
Run Lua in the Tern window that holds this omp's pane, with `cx`: the window API Carly's lua tool has (Tern agents in other panes, not omp subagents; sessions and layout, block reads, git, SQLite, notebooks, boards, browser, canvas, hosts, settings, actions, toasts). The first returned value comes back as JSON; returning an Awaitable (e.g. `return cx.git:status(repo)`) waits for it. `state` is a table kept between calls; `print` output is returned. Each call must finish its synchronous work within Tern's 50 ms plugin budget. Read the `tern` skill before first use.
