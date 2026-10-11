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
- The catalog lists the sessions plugin (the `session_read` tool and the agent's own session
  line) and the threads plugin (the open-threads list from the folder a project's
  `.omp/threads.json` names, its rule and skill), both for omp; the README describes them, with
  both messages shown in the chat.
- AGENTS.md: the text an omp plugin shows lives in Markdown templates (`src/templates/*.md`),
  filled with omp's own Handlebars, as omp keeps its prompts, with strict values: a name the code
  doesn't pass throws, and a value named like a Handlebars helper is refused when the template
  loads. The sessions, threads, tern and agent-variants plugins keep theirs there,
  with `@oh-my-pi/pi-utils` as a dev dependency for their tests.
- `docs/agent-content/`: what agents receive from the omp plugins (tool descriptions and
  parameters, results, errors, messages, rules and skills), each with when it is sent, one page
  per plugin (workflow's skill on a second): what the agent gets in tinted boxes, parameters and
  one-line errors as tables. Rules are shown as omp gives them: an always-applied rule's body
  without its front matter, any other rule's line in the rules list and the body `rule://` reads;
  skills by their line in the skills list and every file `skill://` reads. kagi's MCP tools are
  named, not shown: their text comes from the kagi CLI. `bun tools/agent-content.ts` renders it
  from made-up sample data through each plugin's own code; its wording (headings, when each is
  sent, example labels) is in `tools/agent-content/templates/`. `bun run build` regenerates it
  and `bun run check` fails when a page is out of date, missing or left over, when an omp plugin
  in the catalog has no page, or when a rule or skill a plugin ships is on none.

### Changed

- AGENTS.md is short instructions for agents: layout, commands, workflow, conventions and a few
  code review rules. The detail moved to `docs/` (manifests, reference material).

### Fixed

- The build accepts an MCP stdio `command` that is a `./` path with spaces when it names a
  bundled file; a bare command with whitespace is still refused as a shell string.
