# Changelog

All notable changes to this repository's own tooling, catalog, documentation and CI are
documented in this file. Each plugin under `plugins/` keeps its own changelog.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/).
This repository is never released as a whole: entries collect under Unreleased, and the first
change in a new month moves them into a section for the month they were last changed in,
`## [YYYY.MM] - YYYY-MM-DD`, dated its last day (`bun tools/changelog-cut.ts CHANGELOG.md`).

## [Unreleased]

### Added

- This changelog, for the repository's own tooling, catalog, documentation and CI, with a section
  per month. `bun tools/changelog-cut.ts <file>...` closes a month: once it is over, the entries
  the last commit has under Unreleased move into `## [YYYY.MM] - YYYY-MM-DD`, dated the month's
  last day; entries added since stay under Unreleased. `bun tools/check-changelog.ts` accepts
  month sections, dated within their month, only in this changelog.
  `tools/check-changelog-entries.ts` asks for an entry here for a change outside a plugin's
  folder, and refuses a new entry while Unreleased still holds an earlier month's.
- Linting and formatting with size and complexity limits: oxlint (type-aware) and oxfmt for
  TypeScript, pinned in `package.json` (`bun run lint`, `bun run fmt`), and selene and StyLua for
  Luau. The dev shell provides the tools.
- Changelog checks. `bun tools/check-changelog.ts <file>...` checks that each changelog is named
  exactly CHANGELOG.md and is in Keep a Changelog format, with one Unreleased section and a date
  on every release, as the `keep-a-changelog` parser reads the headings. The build requires each
  plugin to keep one whose newest release has its `plugin.json` version.
  `tools/check-changelog-entries.ts` checks that a commit adds an entry under `## [Unreleased]`
  in the changelog of each thing it changes, unless its message ends with the trailer
  `Changelog: none`, which waives the entry but not the changelog.
- Plugins can pin the prebuilt tools they need. A plugin lists each tool in a `mise.toml` and
  keeps the `mise.lock` that `mise lock` writes for it; the build checks both and generates
  `bin/launcher` and `bin/pins`. The launcher runs a tool you set with `<EXE>_BIN`, or the one on
  your PATH when it is the pinned version, or else downloads the pinned build once, runs it only
  if its sha256 matches, and keeps it in the plugin's data folder. Nix or not, every user gets the
  same build.
- A README (the plugins, how to install them in each agent and in Tern, contributing,
  development) and the MIT license. `reference/agent-plugins/` carries the Agent Plugins license
  texts (Apache-2.0 for the schemas, CC-BY-4.0 for the spec) and a `NOTICE.md` saying what came
  from where; `bun tools/sync-references.ts agent-plugins` fetches and writes them on every
  refresh.
- `bun run fmt` and `bun run fmt:check` format CSS too, with oxfmt and the same settings as
  TypeScript.
- The README says how to install the tern plugin's `omp-ghostty` look in Tern and that it needs
  Tern 0.7.1 or later; `docs/reference.md` says to recheck its style sheets after a Tern update.

### Changed

- AGENTS.md is short instructions for agents: layout, commands, workflow, conventions and a few
  code review rules. The detail moved to `docs/` (manifests, reference material).

### Fixed

- The build accepts an MCP stdio `command` that is a `./` path with spaces when it names a
  bundled file; a bare command with whitespace is still refused as a shell string.
