---
name: tern
description: "Use Tern, the terminal omp runs in (TERM_PROGRAM=tern): Tern agents (coding agents such as omp, Claude Code or Codex in other panes, not omp's own subagents), panes, tabs and sessions, file/git/SQLite/notebook/board/browser blocks, layout, settings, remote hosts. Use whenever the user mentions Tern, asks to open, show or arrange something in the terminal, or to start, prompt, wait on or read an agent in a pane."
---

# Tern

You are in Tern when `TERM_PROGRAM=tern`; `$TERN_PANE` is your pane. Tern already draws omp natively, opens the `browser` tool's pages as Tern panes, opens `/fork` beside you, tracks your working/idle state and resumes you after restarts: don't rebuild those.

## Tern agents are not subagents
- **Tern agents**: coding agents in their own Tern panes (`cx.agents`): omp unless the user names another, such as Claude Code (`claude`) or Codex (`codex`). The user sees them and can talk to them; they keep running after your turn. Start one only when the user asks for an agent in a pane, split or tab, or to work with agents already open in Tern.
- **Subagents**: omp's own `task` tool (and eval `agent()`/`workpool`). Delegated work that returns to you, with no pane. Use those for your own delegation; this skill never replaces them.

## Two interfaces
- `tern` CLI (bash): panes and processes. `tern ls|inspect|split|run|send|capture|close|…`, `--json` on every command; syntax from `tern help` and `tern COMMAND --help`.
- `tern_lua` tool (macOS and Linux, panes on the machine showing the window): everything else, as Lua in the Tern window holding your pane, with `cx` (the window API Carly has). Not offered in a remote host's panes: Tern never lets a remote host run code in your window.
  - The calls below cover common work; reach for the rest only when they don't. Exact API of the installed build: `d=$(mktemp -d) && tern plugin types "$d"`, then read `WindowCx` and the `*Cx` types in `$d/tern.d.luau`. Docs: https://docs.stencil.so/tern/reference/api-window.md (every docs page also exists as `.md`).
  - `cx` and its parts (`cx.layout`, `cx.session`, …) are userdata: `pairs` can't list them. Lua here is Luau without `os.getenv`: write your pane id (`$TERN_PANE`, from bash) and paths into the code.
  - The first returned value comes back as JSON. Return an Awaitable (a `kind` string and a `:next` method, like `tern.sleep(ms)`) and the tool waits for it. One Awaitable per call; there is no `await`, so make dependent steps separate calls.
  - `state` is a table kept between calls (per window, until a plugin reload); `print` output is returned. When your session shows in several Tern windows, your calls stay in the window that answered first while it stays open.
  - Tern stops a call whose synchronous part runs past 50 ms, which also disables the bridge in that window; the tool reports the outcome as unknown and reloads Tern's plugins (resetting `state`). Return slices or counts, not whole trees; put slow work in `tern.process.run` (it returns an Awaitable).
  - "Outcome unknown" means the code may have run: check the state it touches before running anything again.

## Common calls
| Want | `tern_lua` code |
| --- | --- |
| Tern agents with `state` (`idle`, `working`, `waiting_input`, `exited`) | `return cx.agents:list()` |
| Start a Tern agent (it takes focus; give it back with `cx.layout:focus(<your $TERN_PANE>)`) | `return cx.agents:start({prompt = "…", cwd = "/path", how = "split"})` (pane id). Without `command` it runs the agent Tern's settings name, omp by default; `command = "claude"` or `"codex"` starts those |
| Prompt a Tern agent and wait for it to go idle | `cx.agents:ask(P, "…"); return cx.agents:wait(P, {timeout = 110000})` |
| Its final reply (`wait`'s text can be a partial preview) | omp: `return cx.agents:transcript(P, {last = 1})`; other agents have no transcript: `return cx.session:read(P, {lines = 40, as = "text"})` |
| Keep waiting on a working Tern agent | `return cx.agents:wait(P, {timeout = 110000})`; on timeout check `state` and wait again |
| A Tern agent's recent messages and tool calls | `return cx.agents:transcript(P, {last = 4})` |
| Read any block (terminal, file, git, SQLite, notebook, board, browser) | `return cx.session:read(P, {lines = 40, as = "text"})` |
| Panes in this window: `pane` id, `kind`, `title`, `tab`, `focused`, `cwd` | `return cx.session:panes()` |
| Open a file or URL beside the focused pane, keeping focus | `cx:open("/path/file.ts", "beside", {focus = false})` |
| Split a pane and run a command in the new shell, keeping focus (`"down"` splits below) | `local p = cx.layout:split(P, "right", {cwd = "/path"}, {focus = false}); cx:run(p, "ls src\r"); return p` |
| Type into a shell pane; `\r` runs the line | `cx:run(P, "npm test\r")` |
| Close a pane | `cx.layout:close(P)` |
| Name the tab holding a pane | `cx.layout:name_tab(cx.session:tab_of(P), "api")` |
| Git | `return cx.git:status("/repo")`; also `diff`, `log`, `repo` |
| Toast | `cx:toast("info", "text")` |
| Settings | `return cx.settings:get(key)`, `cx.settings:describe(key)`; change them only when asked |

## Rules
- Never use `tern wait --until idle` for agents: it returns while a tool runs silently.
- On `waiting_input`, read the pane and ask the user before answering it.
- Don't take focus unless asked. Close or stop only what you created.
- macOS: the bridge needs App Nap off for Tern, or a background Tern trips the 50 ms budget. If `tern_lua` says App Nap is on, ask the user to run `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern; don't run it yourself.
