# omp-drawer plugins

Plugins for omp (main lane), Claude Code, Codex and Tern. This is a public repo: write everything
for any user, with no project, client, host or person names and no personal paths.

## Layout

- `plugins/<name>/`: one installable package, with its `plugin.json` and `CHANGELOG.md`.
- `plugins/kagi/`: Kagi web search: the pinned kagi CLI's MCP server (`scripts/mcp.sh`, its
  default `KAGI_MCP_TOOLS`), the `kagi` skill and the `web-search` rule.
- `plugins/tern/`: the `tern_lua` tool and `tern` skill; `tern-plugin/` is its Tern half
  (`omp-bridge`), `ghostty-look/` the `omp-ghostty` Tern plugin (style sheets, the look).
- `plugins/workflow/`: rules and the `failure-classes` skill on how to work, for any project.
- `catalog.json`: the plugin list and hosts; the build generates the manifests from it.
- `CHANGELOG.md`: this repo's own changes (tooling, catalog, docs, CI), in monthly sections.
- `tools/`: the build, its schemas, the launcher, the changelog checks and the reference sync.
- `reference/`: generated upstream material; never hand-edit. The public repo carries only
  `agent-plugins/` (its pin is in its `NOTICE.md`); the Tern material and `SYNCED.md` are not in
  the public repo: fetch them with `bun tools/sync-references.ts tern`.
- `.github/workflows/check.yml`: this repo's CI: `bun run check`, in the dev shell.

## Commands

Run in the dev shell (`nix develop`):

    bun run check         # generated files, lint, fmt:check, typecheck, tests
    bun run build         # regenerate manifests; `bun tools/build.ts --check` fails on drift
    bun run lint          # oxlint; Luau: `selene plugins`, `stylua --check plugins`
    bun run fmt           # oxfmt; `bun run fmt:check` only checks
    bun tools/sync-references.ts [tern | agent-plugins ...]   # refresh reference/

## Workflow

- Run `bun run check` before committing.
- A commit changing a plugin adds an entry under its `## [Unreleased]`, and one changing
  anything else here an entry in `CHANGELOG.md`; or its message ends with the trailer
  `Changelog: none`. `CHANGELOG.md` is never released: the first change in a new month first
  runs `bun tools/changelog-cut.ts CHANGELOG.md`, which moves the earlier month's entries into
  their `## [YYYY.MM] - YYYY-MM-DD` section.
- For Tern work, check `reference/` first and cite the file; fetch it with
  `bun tools/sync-references.ts tern` when it is missing, and refresh it when the Tern section of
  `reference/SYNCED.md` is over 7 days old or its version differs from `tern --version`.

## Conventions

- Files at most 300 lines, functions 60 (tests 400 and 120). Split code; don't exempt it.
- Disable a lint rule only for one line, with the reason on the directive; never a block or file.
- Each manifest has one hand-written source; never edit generated files. Run `bun run build`.
- No symlinks in plugin sources; fixed names (`plugin.json`, `SKILL.md`, ...) match exactly.
- Paths here are relative to this repo's root (`plugins/agent-variants`, not a workspace path).
- Workflow rules stay general: a lesson from one project goes in that project's AGENTS.md.

## Code Review Rules

- Schemas are the authority for `plugin.json`, `mcp.json`, the catalog and skill frontmatter.
  Safe path: put a new structural rule in the schema; hand-check only spec prose, citing it.
- A generated file's shape follows its consumer's docs, tested with the consumer's own CLI.
  Safe path: extend `tools/build/consumers.test.ts`, not a copy of the consumer's rules.
- Path containment is lexical, through `isOutside` in `tools/build/paths.ts`.
  Safe path: call `isOutside`; don't add symlink resolution (links are rejected first).

## More detail

- [Manifests and the build](docs/manifests.md) · [Reference material](docs/reference.md)
