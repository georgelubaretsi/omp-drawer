# Manifests and the build

Each manifest has one hand-written source; `bun tools/build.ts` (or `bun run build`) generates
the rest, and `bun tools/build.ts --check` fails when generated files are out of date. Never
edit a generated file; edit its source and rebuild.

## Packages

`plugins/<name>/` is one installable package. `node_modules/` is not part of the package (hosts
never get it), so no path the build accepts may go through it.

Plugin sources contain no symlinks: files, folders, dangling links, or links that stay inside
(`node_modules/` inside a plugin is skipped). Neither do the paths the build generates. The
build stops before reading or writing anything when it finds one. This is narrower than Agent
Plugins §4.1, which allows links that stay inside the plugin, and it keeps every containment
check lexical: containment goes through `isOutside` in `tools/build/paths.ts`, which handles
both separators and Windows drive and UNC paths.

Fixed names (`plugin.json`, `mcp.json`, `package.json`, `skills/`, `SKILL.md`) must match
exactly; a case variant is an error because it only loads on case-insensitive filesystems.

Each package keeps a `CHANGELOG.md` (Keep a Changelog 2.0.0, Semantic Versioning). The build
refuses a plugin without one, one the `keep-a-changelog` parser rejects, one without exactly one
Unreleased section, an undated release, or a newest release whose version isn't
`plugin.json`'s. It reads headings as the parser does, not literally.

## Schemas

The vendored Agent Plugins 1.0.0 schemas in `reference/agent-plugins/1.0.0/` are the authority
for `plugin.json` and `mcp.json`; `tools/catalog.schema.json` and
`tools/skill-frontmatter.schema.json` for the catalog and skill frontmatter. The build
(`tools/build/`) hand-checks only what the spec leaves to prose, each check citing its spec
section, plus the cross-host rules below. A new structural rule goes in a schema, not in code.

JSON sources are parsed with `@humanwhocodes/momoa` and SKILL.md frontmatter with `yaml`, so a
key repeated in one object (often a merge leftover) is an error instead of silently keeping the
last value.

## Sources

### catalog.json

Catalog name, owner, description and the plugin list in output order, each with `category` and
`hosts` (any of `omp`, `claude`, `codex`). Every folder under `plugins/` needs a catalog entry
and a `plugin.json`, and every entry needs a folder (exact names); remove the folder of a
removed plugin.

### plugin.json

An Agent Plugins 1.0 manifest (name, version, description, author, homepage, repository,
license, keywords). Cross-host rules:

- `name` equals the directory and matches `^[a-z0-9]+(-[a-z0-9]+)*$` (no periods), without
  `claude` or `anthropic`.
- `version` and `description` are required.
- No `extensions`: generated manifests would copy it to every host.

### mcp.json

Optional. Agent Plugins MCP servers (`stdio`, `streamable-http`, `sse`; `${PLUGIN_ROOT}`,
`${PLUGIN_DATA}`). The prose rules the build checks:

- `command` is a bare name without whitespace (one with whitespace is a shell string) or a
  bundled `./` file (spaces allowed).
- `cwd` stays inside its root.
- Neither goes through `node_modules`; a `${PLUGIN_DATA}` cwd may.
- `url` is https; plain http only for `localhost` or a loopback IP.
- Headers are valid and unique.

### SKILL.md frontmatter

`skills/<dir>/SKILL.md` frontmatter follows `tools/skill-frontmatter.schema.json`, transcribed
from https://agentskills.io/specification: `name` equals `<dir>`, `description`, `license`,
`allowed-tools`, `metadata`, `compatibility`, and no other keys. A folder under `skills/`
without `SKILL.md` is not a skill and is ignored (Agent Plugins §7.1).

## Generated files

- `.omp-plugin/marketplace.json`, `.claude-plugin/marketplace.json` and
  `.agents/plugins/marketplace.json` (Codex), for the plugins with that host; absent when none.
- For `claude` plugins: `plugins/<name>/.claude-plugin/plugin.json` and `.mcp.json`, with
  Claude Code's variable names.
- `version` and `description` in each `plugins/<name>/package.json`.

Codex entries carry only the fields its docs list (`name`, `source: {source: "local", path}`,
`policy`, `category`). Claude entries leave `version` to the generated `plugin.json`.

A generated file's shape follows its consumer's docs and is tested with the consumer's own CLI,
not with a copy of its rules: `tools/build/consumers.test.ts` loads the generated catalogs with
`codex`, `claude plugin validate --strict` and `omp` when they are installed, with their state
in a temp folder.

## Claude Code rules

Plugins with the `claude` host follow Claude Code's documented behavior where it differs from
Agent Plugins (code.claude.com/docs/en/plugins-reference, /mcp):

- No stdio `cwd`: Claude Code ignores it and runs plugin servers in the project directory, so a
  server must not depend on its working directory.
- No `${...}` in `args` or `env` other than `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`, and none in
  `url` or headers: Claude Code expands them from the user's environment, while Agent Plugins
  hosts keep them literal.
- `author.name` when `author` is set; `homepage` a URL; a catalog name Claude Code doesn't
  reserve.

The consumer test runs a translated server under `claude mcp list` to watch this.

## Pinned tools

A plugin needing a prebuilt binary pins it in `plugins/<name>/mise.toml`
(`"github:<owner>/<repo>" = { version = "…", filter_bins = "<exe>" }`; only the `github:`
backend), next to the `mise.lock` that
`mise lock --platform macos-arm64,macos-x64,linux-x64,linux-arm64` writes there (dev shell;
`mise trust` first). The build checks both and generates `bin/launcher` (a copy of
`tools/launcher/launcher.sh`) and `bin/pins`.

`bin/launcher <exe> [args]` runs, in order of preference: `$<EXE>_BIN`; `<exe>` on `PATH`,
reporting the pinned version; the cached copy in the plugin's data folder; otherwise it
downloads the pinned build and runs it once its sha256 matches.
