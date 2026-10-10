# Reference material

`reference/` holds generated upstream material. Never edit it by hand, and it is never linted.

The public repo carries only `agent-plugins/`. The Tern material (`tern-installed/`,
`tern-docs/`, `tern-sdk/`) and `SYNCED.md` are not in the public repo; fetch them with
`bun tools/sync-references.ts tern`.

## Refreshing

From the repo root: `bun tools/sync-references.ts [tern | agent-plugins ...]` (all sources when
none is named). Then `git status -- reference/` and `git diff --stat -- reference/` show what
changed.

For Tern work, fetch the Tern material if it is missing, check `reference/` before guessing and
cite the file. Refresh the Tern source first when the Tern section of `SYNCED.md` is older than
7 days or its Tern version differs from `tern --version`. When a refresh changes
`tern-installed/`, recheck `plugins/tern` and `tern.yml` (transcribed from `tern.d.luau` for
selene). After any Tern update, recheck the look in Tern's Reader chat style:
the style sheets in `plugins/tern/ghostty-look/` rely on Tern's inner classes, which can change
(`tern-docs/styles/index.md`, "Avoid inner classes").

## Contents

- `tern-installed/` (not in the public repo; fetch with the sync): `tern.d.luau` (plugin API)
  and `cli.txt` (all CLI help) from the installed Tern. It wins over the rest.
- `tern-docs/` (not in the public repo; fetch with the sync): docs.stencil.so/tern: concepts,
  guides, plugin API reference, TSP protocol, script commands.
- `tern-sdk/`: a git clone of stencil-hq/tern-sdk, ignored by git, written by the sync; search
  it by explicit path.
- `agent-plugins/1.0.0/`: `plugin.schema.json` and `mcp.schema.json` from agent-plugins.org
  (the sync fails if they differ from the release tag) and `spec.md`, all pinned to the tag and
  commit in `agent-plugins/NOTICE.md`. The build (`tools/build/`) validates against these files.
- `agent-plugins/LICENSE.md` and `LICENSES/`: the project's licensing terms and license texts
  (schemas Apache-2.0, spec CC-BY-4.0), from the same commit, and `NOTICE.md`, which the sync
  writes: what came from where. They let the folder be redistributed as it is.
- `SYNCED.md` (not in the public repo; written by the sync): one section per source. Tern:
  sync date, Tern version, SDK URL and commit. Agent Plugins: sync date, tag, commit and URLs.

## plugins/tern

`plugins/tern` holds the `tern_lua` tool and the `tern` skill; its Tern half `tern-plugin/` is
linked with `tern plugin link`, as is the look `ghostty-look/` (Tern plugin `omp-ghostty`, a
style sheet only). A throttled background Tern (macOS App Nap) trips Tern's 50 ms
plugin budget, so the bridge needs App Nap off:
`defaults write so.stencil.tern NSAppSleepDisabled -bool YES`.
