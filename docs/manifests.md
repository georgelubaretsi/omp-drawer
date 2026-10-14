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
`hosts` (any of `omp`, `claude`, `codex`, `tern`). Every folder under `plugins/` needs a catalog
entry and a `plugin.json`, and every entry needs a folder (exact names); remove the folder of a
removed plugin. Two optional fields:

- `development`: hosts (`claude`, `codex`) whose part is still in development: built and
  tested, but left out of the manifest that host reads, so it doesn't reach people yet.
- `program`: the plugin's native program, when it has one: its Go command in `cmd/<program>/`,
  and the name people and agents run it by.

### Tern parts

Tern has no marketplace, so the `tern` host is delivered through omp: a plugin with it needs the
`omp` host too (the catalog schema), keeps its Tern plugin in `so.stencil.tern/` (the Agent
Plugins extension directory, §8.2, for Tern's reverse-domain namespace), and its omp part
installs it with `kit/omp/tern-part.ts`. The build checks that the folder exists exactly when the
catalog lists `tern`, and that its `plugin.toml` has the plugin's name as `id` and `plugin.json`'s
`version`. Tern checks the rest of `plugin.toml` itself: `tools/build/consumers.test.ts` links
the part with `tern plugin link` in a throwaway Tern profile.

### Host parts

A plugin may carry code that runs inside a host, in the Agent Plugins extension directory (§8.2)
named for that host's reverse-domain id. The build checks that the folder exists only when the
catalog lists its host, and that it holds `hooks/hooks.json`, which the generated manifest for
that host names in `hooks`. The parts aren't at the plugin root, where the hosts would find
their hooks by default, because each host reads a root `hooks/hooks.json` and refuses the
other's keys.

- Claude Code, `com.anthropic.claudecode/`: a mod (code.claude.com/docs/en/plugins/mods), its
  hooks file naming the module in `modules`; `.claude-plugin/plugin.json` names the file.
  Claude Code checks the rest: `claude plugin validate` in `tools/build/consumers.test.ts` and in
  the plugin's own tests, which also run the mod's tests with
  `claude plugin test com.anthropic.claudecode`. The module's types come from a declaration file
  beside it covering the API it uses: Claude Code's own declarations are not redistributable.
- Codex, `com.openai/`: command hooks (learn.chatgpt.com/docs/hooks); the generated
  `.codex-plugin/plugin.json` (`name` and `hooks`) names the file. Codex skips the hooks of a
  plugin in the Agent Plugins format for now, so a Codex part stays under `development` until it
  doesn't.

### Settings

Everything a person sets for a plugin is declared in one file, `plugins/<name>/core/settings.json`
(`tools/settings.schema.json`). Not at the plugin root: Claude Code reads a `settings.json` there
as its own default settings. The build turns it into `core/settings.gen.ts` for the shells (a
Claude Code mod imports only code) and copies it beside the plugin's vault, as
`cmd/<program>/settings.gen.json`, for the vault to embed:

- `settings`, by key, each a `type` with a title, what it is about and a default: a `choice`
  among fixed values (each a value, a label and what it means), a `text`, or a `path`. The shells
  resolve them (`kit/core/settings.ts`) from the settings files below and the agent's own
  settings screen.
- `secrets`: each a credential, by key: a title, what it is about, and the environment variable
  that may supply it instead (`env`, for CI and containers). The vault keeps them in the
  system's secret store; no agent's settings screen holds them, and no code reads an environment
  variable for a secret that isn't declared here.

The build writes each agent's own settings screen from the settings:

- Claude Code: `userConfig` in `.claude-plugin/plugin.json`, which its mod gets as `register`'s
  options;
- omp: `omp.settings` in `package.json`, which the plugin's omp part reads.

A choice starts with `shared`, its default; a text or path is empty by default. Either way the
default follows the shared one.

#### Settings files

The shared choices live in two files of one format, a section per plugin keyed by its name:
`~/.agents/piebird/settings.json`, the person's, and `<project>/.agents/piebird/settings.json`,
the repo's, committed. `kit/core/settings.ts` resolves each setting, lowest first: the plugin's
default, the project's file, the person's file, the agent's own screen. A repo can't override the
person, and a value a file holds that isn't declared, is a secret, or isn't one of the choices is
reported and skipped. A path is relative to the folder holding `.agents/` unless absolute. The
build writes `schemas/settings.schema.json` from every plugin's declarations, for editors.

### Operations

What a plugin can do for an agent or for another plugin is declared once, in
`plugins/<name>/core/operations.json` (`tools/operations.schema.json`). Each operation, by id
(lowercase words joined by `-`; other plugins name it `<plugin>.<operation>`), has:

- `input`: a JSON Schema for an object, its arguments; `output`: a JSON Schema for its answer;
- `errors`: the error ids it can end with;
- `vault`: true when the plugin's vault performs it, because it needs a secret;
- `tool`: when the model gets it as a tool, its name and hints (`readOnly`, `destructive`,
  `idempotent`, `openWorld`, MCP's annotations; `alwaysLoad`, in front of tool search).

Text the model reads isn't in this file: `title`, `description` and `examples` anywhere in a
schema are refused. It lives in `core/model.ftl`: a tool's message has the operation's id, with
one attribute per argument saying what it is for, and an error's message is `error-<id>`. The
build refuses a schema Ajv can't compile, two tools with one name, and a tool, argument or error
model.ftl doesn't describe. Within a version, changes only add; the build doesn't check that.

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
  Claude Code's variable names; the manifest's `hooks` names the Claude Code part's hooks file,
  and `userConfig` holds the settings.
- For `codex` plugins with a Codex part: `plugins/<name>/.codex-plugin/plugin.json`.
- `version` and `description` in each `plugins/<name>/package.json`, and `omp.settings`.
- `plugins/<name>/kit/`: copies of the kit's parts the plugin's shells use (`kit/core/` with any
  shell, `kit/bun/` with `src/` or `program/`, `kit/omp/` with `src/`, `kit/claude/` with
  `com.anthropic.claudecode/`, `kit/program/` with `program/`), tests left out. A copy a plugin no
  longer needs is deleted.
- `plugins/<name>/core/model.gen.ts` from `core/model.ftl`: the catalog as text and its type,
  each message with the variables it needs. Deleted when the plugin has no `model.ftl`.
- `cmd/<program>/settings.gen.json` from the plugin's `core/settings.json`, without `$schema`,
  for the program to embed (`go:embed` reaches only its own folder).
- `plugins/<name>/core/settings.gen.ts` from `core/settings.json`: the declarations as code, read
  by `kit/core/declared.ts`.
- `schemas/settings.schema.json`: the settings files' schema, from every plugin's settings.
- `plugins/<name>/core/operations.gen.ts` from `core/operations.json` and `core/model.gen.ts`: the
  operations, each tool and argument with its text, read by `kit/core/operations.ts`. A message
  that is missing or needs variables fails to compile.

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

## Native programs

A plugin that holds a secret has a vault: a signed Go program that keeps the secret and performs
the operations that need it (`core/operations.json`, `vault: true`), as a command in
`cmd/<program>/` (package `main`) that its catalog entry names (`program`), in the module of
`go.mod` (`piebird.dev/plugins`). The parts vaults share (secret stores, the sign-in page,
operations over JSON) are in `internal/`. `bun tools/native.ts` (part of `bun run build`)
compiles it into `plugins/<name>/native/`, which is never committed:

- `native/<platform>/<program>` for macos-arm64, macos-x64, linux-arm64 and linux-x64;
- `native/<program>.exe` for Windows (x64; Windows on ARM runs it emulated);
- `native/<program>`, a POSIX script that starts this system's build.

The plugin's shells and skills run `native/<program>`, and `native/<program>.exe` on Windows
(`kit/core/vault.ts`). Builds are reproducible (`-trimpath`, no build id, no VCS stamp,
`CGO_ENABLED=0`), so a binary can be checked against its source.

A plugin's Bun program, `plugins/<name>/program/main.ts`, is built beside them under the plugin's
own name (`native/<platform>/<name>`, `native/<name>.exe`, the starter `native/<name>`), with
`bun build --compile` for each platform. The program reads no `bunfig.toml`, `.env`,
`tsconfig.json` or `package.json` from the folder it runs in, so a cloned repo can't change what
it does. On a Mac the build signs the macOS builds again: Bun's signature of a build for the
other architecture is invalid, and macOS kills such a program at launch. They are signed ad hoc,
or with the Developer ID in `PIEBIRD_CODESIGN_IDENTITY` when it is set (Go's builds too, for
notarization), hardened, the Bun builds with `tools/bun.entitlements` (`allow-jit`): without
it the hardened runtime keeps Bun's JavaScript engine from compiling, and a program runs about
8 times slower. `bun tools/native.ts --release` refuses a build for this system that links a
library outside the system's own, as a Bun that isn't Bun's official build does (the dev
shell's links Nix's ICU), and refuses to build macOS programs anywhere but on a Mac.

### Releases

Pushing a plugin's tag, `<plugin>/v<version>` with the version in its `plugin.json`, runs
`.github/workflows/release.yml`: on a Mac, with Bun's official build, `bun tools/release.ts`
builds the plugin's programs as a release, signs the macOS builds with the Developer ID and has
Apple notarize them, signs the Windows builds when the repository variable `WINDOWS_SIGNING` is
`on` (it waits for the code-signing certificate; until then they are unsigned), and packs one
archive per platform, `<plugin>-<version>-<platform>.tar.gz` holding `native/` as the plugin
carries it, with `SHA256SUMS`. The workflow publishes them as the tag's GitHub release. Its
signing secrets live in the `release` environment, limited to the release tags, so a workflow
edited on a branch can't read them; the workflow's header lists them.
