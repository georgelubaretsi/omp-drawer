# The kit

`kit/` is the code plugins share, kept once with its tests and copied by the build into each plugin
that uses it (`plugins/<name>/kit/<part>/`; see [Manifests and the build](manifests.md)). A
plugin's logic and the text its model reads live in its `core/`; each shell is thin, made from the
kit part for its harness.

## core: pure

Relative imports only and no runtime APIs (the core override in `.oxlintrc.json`, and the build's
check of where relative imports lead), so it runs in omp, in a Claude Code mod and in a program alike.

- `model.ts`: the strict Fluent catalog. Only a `Catalog` makes `ModelText`, the one type the
  shells send to a model; its brand is written nowhere else (the build checks), and
  `core/model.gen.ts` types each message and its variables. `textById` words a message whose id
  arrives at run time, such as a vault's error, with the same refusals.
- `operations.ts`: a plugin's operations (`core/operations.json`, joined with their text by the
  generated `core/operations.gen.ts`) and the contract with the code that performs them: a
  `Handler` takes the input as sent, and the call's signal, which aborts when the caller cancels
  the call (omp's tool signal, an MCP client's `notifications/cancelled`), and ends with an
  `Outcome`, its answer (`ModelText` and data) or one of its declared errors (`ModelText` from
  `error-<id>`). A tool that can't answer so takes its words from the catalog too: `crashed`
  (`error-crashed`) when its code fails, `badArguments` (`error-arguments`) when its arguments
  don't fit its schema; a plugin with tools has both. `Io.run` kills a program when the signal
  it's given aborts.
- `settings.ts`, `declared.ts`: a plugin's declarations (`core/settings.gen.ts`) and its settings,
  resolved from the two settings files and the agent's own screen ([Settings](manifests.md#settings)).
- `io.ts`: `Io`, what a shell lends core code that needs the outside world (reading a file whole
  or in pieces, listing a folder, running a program), and `Place` (home, project, plugin
  folders). `readPieces` is for files too big to hold, such as session journals of hundreds of
  megabytes: a loop that leaves early stops the read.
- `vault.ts`: calling the plugin's vault, the signed program that holds its secrets: `<vault>
  call <operation>`, the input as JSON on stdin, `{"output": …}` or `{"error": {"id",
  "variables"}}` on stdout; `vaultPath` is where the plugin keeps it.

## bun: the shells on Bun

`bunIo()`, the `Io` of the omp extension and of the program; copied into plugins with either.

## omp: the extension

- `registerOperations(pi, operations, handlersFor)`: one tool per operation the model gets, kept
  in front of tool search when its `alwaysLoad` hint says so. Each call is performed by the
  handler `handlersFor(ctx)` gives for the calling session's context; a declared error comes back
  as a tool error in its text, and a handler that throws, or an operation without one, as
  `error-crashed`.
- `ompPlace(ctx, dir)`; `ompChoices(plugin, cwd)`: omp's own choices for the plugin's settings,
  the person's (the plugins lock file: the agent level of `readSettings`) and the project's
  (`.omp/plugin-overrides.json`, which a repo can hold: it ranks with the project's settings
  file); `addToSystemPrompt(pi, text)`.

## claude: the Claude Code mod

A mod may call `$` only in its hooks module, in full (`$.fs.read(...)`) or from a top-level
function of that file. So `kit/claude/` holds no `$` code: each plugin's `register.ts` carries the
`ioOf($)` and `placeOf($)` of [`kit/claude/io-of.md`](../kit/claude/io-of.md), whose closures the
kit's functions use. The build refuses a hooks module whose copy differs from the block.

- `toolSpecs(operations)` for `$.tool.register` (on `session.start`), `toolNames(plugin,
  operations)` for the `tool.call` matcher, `dispatch(...)`: the handler's text as the result, a
  declared error or a failure as a refusal (`{deny}`), which is how a mod's answer reaches the
  model as an error. Another plugin's tool goes on to Claude Code.
- `contextBlock(name, text)` for `prompt.context`.
- `stdoutPieces`, `printerOf`, `FS_READ_LIMIT` (`pieces.ts`): `readPieces` in a mod, where
  `$.fs.read` refuses a file over 4 MiB, so a bigger one is printed by `cat` (cmd's `type` on
  Windows) through `$.process.spawn` and read as it comes.
- `claude-code.d.ts`: the part of Claude Code's mod API the kit and the hooks modules use,
  declared from its documentation, and the part of `claude-code/testing` a mod's tests use; the
  mod's own `tsconfig.json` includes it.

## program: the Bun program

For Codex and the desktop apps. `main.ts` calls `runProgram(argv, { name, parts, settings })`,
where `parts()` returns the operations, handlers, instructions and hook, with the person's
settings read from their settings files (no host passes the program settings of its own), and
`settings` is the plugin's declarations (`core/settings.gen.ts`), for a plugin that has some:

- `mcp`: the tools over MCP on stdio (`@modelcontextprotocol/server`), for clients of the 2025
  handshake and of the 2026-07-28 protocol. The server checks each call's arguments against the
  tool's schema itself and answers ones that don't fit with `error-arguments`. A result
  is the outcome's text only, what the model reads in every shell: Codex shows a result's
  structured content instead of its text, so the tools declare no output schema. `afterCall`
  hears each outcome with the call's `_meta` (Codex sends its session id there).
- `hook`: one Codex hook event on stdin, answered with `deny`, `addContext` or `allow`.
- `call <operation>`: one operation, JSON input on stdin, `{"output": …}` or `{"error": {"id",
  "text"}}` on stdout: how plugins and scripts use each other's operations.
- `settings`: the person's settings page (`settings.ts`), opened in their browser: each setting
  with its choices, saved into `~/.agents/piebird/settings.json`, where every agent reads it.
  Other plugins' sections and keys it doesn't know are kept; a setting set back to its default
  is removed; a file that isn't JSON or can't be read is left alone. The installer serves the
  same page for all plugins. The page is a local one (`local-page.ts`): 127.0.0.1, behind a
  random path, refusing other host names and paths, never cached.

`files.ts` reads and replaces files people keep their settings in, for the page and the
installer: one that can't be read is never taken for empty, and a replaced one keeps its
permissions.

`bun tools/native.ts` compiles it ([Native programs](manifests.md#native-programs)).
