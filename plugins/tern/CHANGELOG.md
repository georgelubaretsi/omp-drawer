# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Rule `tern-agents` (always loaded): in Tern, read the `tern` skill before working with panes,
  tabs, sessions or Tern agents, and keep omp subagents (`task`) apart from Tern agents in panes.
- Tool `tern_lua`: run Lua in the Tern window that holds omp's pane, with Tern's window API
  (`cx`): Tern agents in other panes, sessions and layout, block reads, git, SQLite, notebooks,
  boards, browser, settings and toasts. Returns the first value as JSON, waits on a returned
  Awaitable (`timeout_s`, default 130 s, max 600 s), keeps a `state` table between calls and
  returns `print` output.
- Offered only inside Tern (`TERM_PROGRAM=tern`) on macOS and Linux, and not in a remote host's
  panes.
- Tern plugin `omp-bridge`, the Tern half of the tool: install it once with
  `tern plugin link <plugin folder>/tern-plugin && tern plugin reload`. The tool prints this
  command when the bridge is missing.
- Safe failure handling: a call that overruns Tern's 50 ms plugin budget is reported as
  "outcome unknown", never retried, and Tern's plugins are reloaded so the next call can run.
- macOS App Nap check: when a background Tern stalls the bridge, the tool tells you to run
  `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern.
- Skill `tern`: how to work with Tern agents (separate from omp subagents), panes, blocks,
  layout and settings through the `tern` CLI and `tern_lua`, with common calls and rules.
- Supported host: omp.
