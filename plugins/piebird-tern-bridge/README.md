# piebird-tern-bridge

Let omp work the [Tern](https://docs.stencil.so/tern/) window it runs in. Ask in plain words: open
a file beside you, split a pane and run the tests there, start a Tern agent (omp, Claude Code or
Codex in its own pane) and read its answer, name a tab. The `tern_lua` tool runs Lua with Tern's
window API in the window holding omp's pane.

[![omp opens a file beside itself, then starts a Tern agent and reads its answer](../../demos/piebird-tern-bridge/demo.webp)](../../demos/piebird-tern-bridge/demo.mp4)

## Install

    omp plugin marketplace add georgelubaretsi/piebird
    omp plugin install piebird-tern-bridge@piebird

The plugin's Tern half (`so.stencil.tern/`) comes with it: the next time omp starts in a Tern
pane, it installs it into Tern and says so in the chat. After `omp plugin upgrade` it updates it
the same way. Turned off in Tern's settings, it is left alone.

## What it adds

- `tern_lua`: Lua in the Tern window, with `cx`, the window API Tern's own assistant has. The
  tool reports a Lua error as an error, and a call that may have run as "outcome unknown".
- The `tern` skill: the common calls (panes, files, Tern agents, git, layout), the `tern` CLI for
  the rest, and the rules (don't take focus unless asked, close only what you opened).
- In Tern only, a part of every agent's system prompt: read the skill first, and keep omp's own
  subagents apart from Tern agents in panes. Outside Tern, omp gets none of it.

## Requirements

- Tern on macOS or Linux, omp in a pane on the same machine. Panes on a remote host don't get
  the tool: Tern never lets a remote host run code in your window.
- macOS: App Nap off for Tern, or a Tern window in the background is too slow to answer. The
  tool says so when it's on; the fix is
  `defaults write so.stencil.tern NSAppSleepDisabled -bool YES`, then restart Tern.

[What the model sees](../../docs/model/piebird-tern-bridge.md): the tool, the rule and the
skill, word for word.
