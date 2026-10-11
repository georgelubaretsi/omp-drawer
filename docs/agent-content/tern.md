# tern: what agents receive

Each tinted box, and each cell under "What the agent gets", is exactly what the agent receives; everything else is a note. All of it only inside Tern (`TERM_PROGRAM=tern`), on macOS or Linux, and not in a remote host's pane.

**Contents:** [Tool](#tool) · [Results](#results) · [Errors](#errors) · [Rules](#rules) · [Skills](#skills) · [All plugins](index.md)

## Tool

**Description**, sent in every model request:

> [!NOTE]
> Run Lua in the Tern window that holds this omp's pane, with \`cx\`: the window API Carly's lua tool has (Tern agents in other panes, not omp subagents; sessions and layout, block reads, git, SQLite, notebooks, boards, browser, canvas, hosts, settings, actions, toasts). The first returned value comes back as JSON; returning an Awaitable (e.g. \`return cx.git:status(repo)\`) waits for it. \`state\` is a table kept between calls; \`print\` output is returned. Each call must finish its synchronous work within Tern's 50 ms plugin budget. Read the \`tern\` skill before first use.

**Parameters**, sent with it:

| Parameter | What the agent gets |
| --- | --- |
| `code` | Luau chunk; \`cx\`, \`state\` and \`print\` are in scope; \`return\` the value you want back |
| `timeout_s` | Seconds to wait for the answer (default 130, max 600) |

## Results

**When:** the Lua code ran and returned.

**Printed output and a returned table.** Call: `tern_lua {"code":"print(#cx.agents:list()) return cx.agents:list()"}`

> [!NOTE]
> printed:\
> 2
>
> result:\
> \[\
>   {\
>     "pane": 41,\
>     "state": "idle",\
>     "title": "review checkout PR"\
>   },\
>   {\
>     "pane": 42,\
>     "state": "working",\
>     "title": "fix flaky test"\
>   }\
> \]

**Nothing returned.** Call: `tern_lua {"code":"cx:toast(\"info\", \"done\")"}`

> [!NOTE]
> result:\
> nil

**A value that isn't JSON** (the note comes from the Tern side):

> [!NOTE]
> result:\
> "function: 0x6000034c"
>
> note: the result was not JSON-encodable, so it is shown as tostring(): function: 0x6000034c

**An answer over 60,000 characters** ends like this, after its first 60,000 characters:

> [!NOTE]
> … truncated at 60000 of 70010 characters; return less (fields, a slice, a count)

## Errors

**When:** a call fails; the agent gets the error message.

| When | What the agent gets |
| --- | --- |
| The Tern half isn't installed | The omp-bridge Tern plugin is not loaded: its data folder \~/Library/Application Support/Tern/plugin-data/omp-bridge does not exist. Install it with: tern plugin link "/opt/omp-drawer/plugins/tern/tern-plugin" && tern plugin reload. If Tern runs with TERN\_CONFIG\_DIR, give omp the same value. |
| No Tern window took the request | No Tern window holding pane 42 (this omp's TERN\_PANE) took the request, even after \`tern plugin reload\`; the code did not run. Is this pane's session open in a Tern window? Check \`tern plugin list\` and Tern's log. |
| Cancelled before Tern ran it | Cancelled before Tern ran the code. |
| The request is over 1 MiB | The request is 1310720 bytes once JSON-encoded; Tern reads at most 1048576. Nothing was sent. Split the code into smaller calls, or keep large data in a file and read it with tern.fs.read. |
| Outcome unknown: cancelled after a window took it | Outcome unknown: cancelled after a Tern window took the request. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again. |
| Outcome unknown: no answer within the timeout | Outcome unknown: no answer within 130 s. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again. |
| Outcome unknown: the window stopped listening, plugins reloaded | Outcome unknown: the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed). The code may have run partly or fully and was NOT retried; check the state it touches before running anything again. Tern's plugins were reloaded, so the next call can run (\`state\` was reset). |
| The same, with App Nap on | Outcome unknown: the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed). The code may have run partly or fully and was NOT retried; check the state it touches before running anything again. Tern's plugins were reloaded, so the next call can run (\`state\` was reset). App Nap is on for Tern, which can throttle a background Tern past its 50 ms plugin budget: ask the user to run \`defaults write so.stencil.tern NSAppSleepDisabled -bool YES\` and restart Tern. |
| A reload was needed and the `tern` command is missing | the \`tern\` command was not found (set TERN\_BIN) |
| Tern's answer file held null | \~/Library/Application Support/Tern/plugin-data/omp-bridge/res/7f3a.json holds null, not an answer |
| Tern's callback had no window (from the Tern side) | Lua error: omp-bridge: Tern gave the callback no window context |

**The Lua code failed**, after printing something:

> [!NOTE]
> Lua error: tern\_lua:1: attempt to index nil with 'list'
>
> printed:\
> starting

## Rules

### `tern-agents`

**When:** always, in every session's system prompt while the tern plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Tern
>
> \- In Tern (\`TERM\_PROGRAM=tern\`), read the \`tern\` skill before working with panes, tabs, sessions, Tern agents or Tern blocks; use \`tern\_lua\` and the \`tern\` CLI for them.\
> \- Two different things are called agents; keep them apart:\
>   \- \*\*Subagents\*\*: omp's own \`task\` tool (and eval \`agent()\`/\`workpool\`). Work delegated inside this session; results return to you; no pane. The default for delegating work, in Tern or not.\
>   \- \*\*Tern agents\*\*: separate omp sessions in their own Tern panes (\`cx.agents\`), visible to the user, who can talk to them; they keep running after your turn. Start one only when the user asks for an agent in a pane, split or tab, or to work with agents already open in Tern.

## Skills

### `tern`

**In the skills list**, in every session's system prompt while the tern plugin is on (omp may shorten the description):

> [!NOTE]
> \- tern: Use Tern, the terminal omp runs in (TERM\_PROGRAM=tern): Tern agents (omp sessions in other panes, not omp's own subagents), panes, tabs and sessions, file/git/SQLite/notebook/board/browser blocks, layout, settings, remote hosts. Use whenever the user mentions Tern, asks to open, show or arrange something in the terminal, or to start, prompt, wait on or read an agent in a pane.

**When the agent reads `skill://tern`**, which omp tells it to do first when the description matches the task. The whole file, as the agent gets it:

> [!NOTE]
> \---\
> name: tern\
> description: "Use Tern, the terminal omp runs in (TERM\_PROGRAM=tern): Tern agents (omp sessions in other panes, not omp's own subagents), panes, tabs and sessions, file/git/SQLite/notebook/board/browser blocks, layout, settings, remote hosts. Use whenever the user mentions Tern, asks to open, show or arrange something in the terminal, or to start, prompt, wait on or read an agent in a pane."\
> \---
>
> \# Tern
>
> You are in Tern when \`TERM\_PROGRAM=tern\`; \`$TERN\_PANE\` is your pane. Tern already draws omp natively, opens the \`browser\` tool's pages as Tern panes, opens \`/fork\` beside you, tracks your working/idle state and resumes you after restarts: don't rebuild those.
>
> \#\# Tern agents are not subagents\
> \- \*\*Tern agents\*\*: separate omp sessions in their own Tern panes (\`cx.agents\`). The user sees them and can talk to them; they keep running after your turn. Start one only when the user asks for an agent in a pane, split or tab, or to work with agents already open in Tern.\
> \- \*\*Subagents\*\*: omp's own \`task\` tool (and eval \`agent()\`/\`workpool\`). Delegated work that returns to you, with no pane. Use those for your own delegation; this skill never replaces them.
>
> \#\# Two interfaces\
> \- \`tern\` CLI (bash): panes and processes. \`tern ls\|inspect\|split\|run\|send\|capture\|close\|…\`, \`--json\` on every command; syntax from \`tern help\` and \`tern COMMAND --help\`.\
> \- \`tern\_lua\` tool (macOS and Linux, panes on the machine showing the window): everything else, as Lua in the Tern window holding your pane, with \`cx\` (the window API Carly has). Not offered in a remote host's panes: Tern never lets a remote host run code in your window.\
>   \- Exact API of the installed build: \`d=$(mktemp -d) && tern plugin types "$d"\`, then read \`WindowCx\` and the \`\*Cx\` types in \`$d/tern.d.luau\`. Docs: https://docs.stencil.so/tern/reference/api-window.md (every docs page also exists as \`.md\`).\
>   \- The first returned value comes back as JSON. Return an Awaitable (a \`kind\` string and a \`:next\` method, like \`tern.sleep(ms)\`) and the tool waits for it. One Awaitable per call; there is no \`await\`, so make dependent steps separate calls.\
>   \- \`state\` is a table kept between calls (per window, until a plugin reload); \`print\` output is returned. When your session shows in several Tern windows, your calls stay in the window that answered first while it stays open.\
>   \- Tern stops a call whose synchronous part runs past 50 ms, which also disables the bridge in that window; the tool reports the outcome as unknown and reloads Tern's plugins (resetting \`state\`). Return slices or counts, not whole trees; put slow work in \`tern.process.run\` (it returns an Awaitable).\
>   \- "Outcome unknown" means the code may have run: check the state it touches before running anything again.
>
> \#\# Common calls\
> \| Want \| \`tern\_lua\` code \|\
> \| --- \| --- \|\
> \| Tern agents with \`state\` (\`idle\`, \`working\`, \`waiting\_input\`, \`exited\`) \| \`return cx.agents:list()\` \|\
> \| Start a Tern agent (it takes focus; give it back with \`cx.layout:focus(\<your $TERN\_PANE\>)\`) \| \`return cx.agents:start({prompt = "…", cwd = "/path", how = "split"})\` (pane id; \`command\` overrides the agent command) \|\
> \| Prompt a Tern agent and wait for it to go idle \| \`cx.agents:ask(P, "…"); return cx.agents:wait(P, {timeout = 110000})\` \|\
> \| Its final reply (\`wait\`'s text can be a partial preview) \| \`return cx.agents:transcript(P, {last = 1})\` \|\
> \| Keep waiting on a working Tern agent \| \`return cx.agents:wait(P, {timeout = 110000})\`; on timeout check \`state\` and wait again \|\
> \| A Tern agent's recent messages and tool calls \| \`return cx.agents:transcript(P, {last = 4})\` \|\
> \| Read any block (terminal, file, git, SQLite, notebook, board, browser) \| \`return cx.session:read(P, {lines = 40, as = "text"})\` \|\
> \| Open a file or URL beside the focused pane, keeping focus \| \`cx:open("/path/file.ts", "beside", {focus = false})\` \|\
> \| Git \| \`return cx.git:status("/repo")\`; also \`diff\`, \`log\`, \`repo\` \|\
> \| Toast \| \`cx:toast("info", "text")\` \|\
> \| Settings \| \`return cx.settings:get(key)\`, \`cx.settings:describe(key)\`; change them only when asked \|
>
> \#\# Rules\
> \- Never use \`tern wait --until idle\` for agents: it returns while a tool runs silently.\
> \- On \`waiting\_input\`, read the pane and ask the user before answering it.\
> \- Don't take focus unless asked. Close or stop only what you created.\
> \- macOS: the bridge needs App Nap off for Tern, or a background Tern trips the 50 ms budget. If \`tern\_lua\` says App Nap is on, ask the user to run \`defaults write so.stencil.tern NSAppSleepDisabled -bool YES\` and restart Tern; don't run it yourself.
