# Reference material

`reference/` holds generated upstream material. Never edit it by hand, and it is never linted.

The public repo carries only `agent-plugins/`. The Tern material (`tern-installed/`,
`tern-docs/`, `tern-sdk/`), omp's source (`omp/`), the Claude Code and Codex docs
(`claude-code-docs/`, `codex-docs/`), the MCP repository (`mcp/`) and `SYNCED.md` are not in the
public repo; fetch them with `bun tools/sync-references.ts`.

## Refreshing

From the repo root: `bun tools/sync-references.ts [tern | omp | agent-plugins | claude-code | codex | mcp ...]` (all sources when
none is named). Then `git status -- reference/` and `git diff --stat -- reference/` show what
changed.

For Tern work, fetch the Tern material if it is missing, check `reference/` before guessing and
cite the file. Refresh the Tern source first when the Tern section of `SYNCED.md` is older than
7 days or its Tern version differs from `tern --version`. When a refresh changes
`tern-installed/`, recheck `plugins/piebird-tern-bridge` and `tern.yml` (transcribed from `tern.d.luau` for
selene). After any Tern update, recheck the look in Tern's Reader chat style:
the style sheets in `plugins/piebird-tern-ghostty-style/so.stencil.tern/` rely on Tern's inner classes, which can change
(`tern-docs/styles/index.md`, "Avoid inner classes").

For omp work (plugins, extensions, tools, the session journal), check omp's source in `omp/`
before guessing and cite the file. It is checked out at the tag of the installed omp; refresh it
first when the omp version in `SYNCED.md` differs from `omp --version`.

For Claude Code or Codex work (their plugins, hooks, Claude Code's mods, MCP setup, config),
check their docs before guessing and cite the page. The docs describe each agent's latest
release; refresh them when their section of `SYNCED.md` is older than 7 days or its version
differs from `claude --version` or `codex --version`. For MCP work (a server, a client, the
wire format), check the specification and schema in `mcp/` and cite the file; refresh it when
its section is older than 7 days.

## Contents

- `tern-installed/` (not in the public repo; fetch with the sync): `tern.d.luau` (plugin API)
  and `cli.txt` (all CLI help) from the installed Tern. It wins over the rest.
- `tern-docs/` (not in the public repo; fetch with the sync): docs.stencil.so/tern: concepts,
  guides, plugin API reference, TSP protocol, script commands.
- `tern-sdk/`: a git clone of stencil-hq/tern-sdk, ignored by git, written by the sync; search
  it by explicit path.
- `omp/`: a shallow git clone of can1357/oh-my-pi (MIT) at the tag of the installed omp (about
  300 MB on disk), ignored by git, written by the sync; search it by explicit path. The extension API is
  in `packages/coding-agent/src/extensibility/`, the session journal in
  `packages/coding-agent/src/session/`, the native renderers in `packages/tui/src/`.
- `agent-plugins/1.0.0/`: `plugin.schema.json` and `mcp.schema.json` from agent-plugins.org
  (the sync fails if they differ from the release tag) and `spec.md`, all pinned to the tag and
  commit in `agent-plugins/NOTICE.md`. The build (`tools/build/`) validates against these files.
- `agent-plugins/LICENSE.md` and `LICENSES/`: the project's licensing terms and license texts
  (schemas Apache-2.0, spec CC-BY-4.0), from the same commit, and `NOTICE.md`, which the sync
  writes: what came from where. They let the folder be redistributed as it is.
- `claude-code-docs/` (not in the public repo; fetch with the sync): every page code.claude.com's
  `llms.txt` names, as published, by URL path (`docs/en/plugins/mods/reference.md`, …).
- `codex-docs/` (not in the public repo; fetch with the sync): every page learn.chatgpt.com's
  `llms.txt` names, and those of developers.openai.com's Codex and plugin sections, by URL path
  (`docs/hooks.md`, `docs/config-file/config-reference.md`, `plugins/build/plugins.md`, …).
- `mcp/`: a shallow git clone of modelcontextprotocol/modelcontextprotocol at main, ignored by
  git, written by the sync: the specification of every version and the draft
  (`docs/specification/<version>/`), the schemas (`schema/<version>/`) and the SEPs (`seps/`).
- `SYNCED.md` (not in the public repo; written by the sync): one section per source. Tern:
  sync date, Tern version, SDK URL and commit. omp: sync date, omp version, tag and commit.
  Agent Plugins: sync date, tag, commit and URLs. Claude Code and Codex: sync date, the installed
  CLI's version, the page count and pages the index names that are gone. MCP: sync date, commit
  and the specification versions.

## Tern plugins

`plugins/piebird-tern-bridge` holds the `tern_lua` tool and the `tern` skill, with its Tern half in
`so.stencil.tern/`; `plugins/piebird-tern-ghostty-style` is the look, a Tern plugin of style sheets. omp
installs each Tern part (`kit/omp/tern-part.ts`). To work on one, link it instead:
`tern plugin link plugins/<name>/so.stencil.tern`; omp leaves a linked part alone. A throttled
background Tern (macOS App Nap) trips Tern's 50 ms plugin budget, so the bridge needs App Nap
off: `defaults write so.stencil.tern NSAppSleepDisabled -bool YES`.
