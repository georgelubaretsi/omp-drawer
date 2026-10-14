# `ioOf($)` and `placeOf($)` for a Claude Code mod

Claude Code refuses a hooks module that passes `$` to a function in another file, or aliases or
destructures it. So `kit/claude/` holds no `$` calls, and each plugin's
`com.anthropic.claudecode/hooks/register.ts` carries these two top-level functions. They build the
`Io` and `Place` (kit/core/io.ts) that core's handlers take. Copy the block as it is. The build
copies kit/ to `<plugin>/kit/`, so the imports are `../../kit/...` from `hooks/`.

```ts
/** Core's file reads, folder listings and program runs, made of this session's `$`. */
function ioOf($: Api): Io {
	return {
		async readText(path) {
			try {
				return await $.fs.read(path);
			} catch (error) {
				// $.fs.read rejects a missing file as it does any other failure ("… failed: ENOENT").
				if (!(await $.fs.exists(path))) return undefined;
				throw error;
			}
		},
		async readPieces(path) {
			if (!(await $.fs.exists(path))) return undefined;
			// Nothing is read or spawned until the first piece is asked for.
			return (async function* () {
				if ((await $.fs.stat(path)).size < FS_READ_LIMIT) {
					yield await $.fs.read(path);
					return;
				}
				const printer = printerOf(path, (await $.env.get("OS")) === "Windows_NT");
				yield* stdoutPieces($.process.spawn(printer), printer);
			})();
		},
		async list(path) {
			try {
				return (await $.fs.list(path)).map(entry => ({
					name: entry.name,
					directory: entry.kind === "dir",
					modified: entry.kind === "file" ? entry.mtimeMs : 0,
				}));
			} catch (error) {
				if (!(await $.fs.exists(path))) return undefined;
				throw error;
			}
		},
		// Rejects when the program can't start or outlives timeoutMs (default 30 s, at most 10 min).
		run: (argv, options) => $.process.run(argv, { ...options }),
	};
}

/** The person's home, the session's project root (it follows /cd), and the plugin's folder. */
async function placeOf($: Api): Promise<Place> {
	const home = (await $.env.get("HOME")) ?? (await $.env.get("USERPROFILE"));
	if (home === undefined) throw new Error("neither HOME nor USERPROFILE is set");
	return { home, project: await $.session.root(), plugin: $.plugin.root };
}
```

## What it relies on (Claude Code 2.1.296, checked in a session)

- `$.fs.read(path)` resolves to the text and rejects when the file is missing, with an `Error`
  named `HooksError` whose message ends in `failed: ENOENT`. It has no `code`, so the snippet asks
  `$.fs.exists` only after a read fails. A folder rejects with `EISDIR` and is passed on.
- `$.process.run(argv, { stdin, timeoutMs })` runs without a shell and resolves whatever the exit
  code (`exitCode`, `stdout`, `stderr`, plus truncation flags `Io` ignores). It rejects when the
  program can't start (`failed to start: ENOENT`) or outlives `timeoutMs` (`aborted: still
running after <n>ms`). The namespace is documented as CLI only.
- `$.session.root()` is the project root, where the session started or where `/cd` took it. At
  `session.start` it equals `e.cwd`, symlinks resolved (`/private/tmp/...` on macOS).
  `$.plugin.root` is the folder holding `.claude-plugin/plugin.json`, as given (`/tmp/...`).
- `$.env.get` takes a string literal, so the validator can list the names the mod reads.
- `$.fs.list(path)` resolves to the folder's entries, each with `name`, `kind` (`file`, `dir`, or
  `other` for a link, not followed) and `mtimeMs` (a file's last modification).
- `$.fs.read` refuses a file over 4 MiB, so `readPieces` reads only a file under
  `FS_READ_LIMIT` (`$.fs.stat(path).size`) with it. A bigger one is printed by `cat` (cmd's
  `type` on Windows) through `$.process.spawn`, which hands the output over in pieces as it
  comes, with no limit, and stops the program when the loop leaves early.

`Api` is `$`'s type in [`claude-code.d.ts`](claude-code.d.ts), the part of Claude Code's mod API the
kit and the hooks modules use, declared from its documentation. Claude Code's own declarations,
written into `.claude-plugin/types/` when a mod loads with `--plugin-dir`, are the reference; the
snippet typechecks against both.

## A hooks module that serves core's operations

`PLUGIN` is plugin.json's `name`. The module can't read it before a hook runs, and the `tool.call`
matcher is fixed when the module loads. `claude plugin validate` shows the computed matcher as
`tool.call{tool=?}`; the engine applies it. The tests run with `claude plugin test .` from the
plugin's folder: given `com.anthropic.claudecode`, Claude Code takes that as the plugin's folder
and refuses the imports of `kit/` and `core/` as outside it.

```ts
import type { Api, Register } from "claude-code";
import type { Io, Place } from "../../kit/core/io";
import { contextBlock } from "../../kit/claude/context";
import { FS_READ_LIMIT, printerOf, stdoutPieces } from "../../kit/claude/pieces";
import { dispatch, toolArguments, toolNames, toolSpecs } from "../../kit/claude/tools";
import { handlersFor } from "../../core/handlers";
import { model } from "../../core/model.gen";
import { operations } from "../../core/operations.gen";

const PLUGIN = "piebird-example";

// ioOf and placeOf, as above.

export const register: Register = on => {
	on("session.start", async ($, e, next) => {
		for (const spec of toolSpecs(operations)) await $.tool.register(spec);
		return next(e);
	});
	on("prompt.context", async ($, e, next) => {
		const r = await next(e);
		return { ...r, blocks: [...r.blocks, contextBlock(PLUGIN, model.text("context"))] };
	});
	on("tool.call", { tool: toolNames(PLUGIN, operations) }, async ($, e, next) => {
		const handlers = handlersFor(ioOf($), await placeOf($));
		return (await dispatch(operations, handlers, e.tool, toolArguments(e))) ?? next(e);
	});
};
```

`handlersFor(io, place)` stands for the plugin's own core code that makes its `Handlers`. What the
model reads, from this module (kit/claude/mod.test.ts builds it) in a `claude -p` session against a
recording API stub:

- A tool registered with `isDeferred: false` (an operation with `alwaysLoad`) is in the request's
  tool list as `mcp__<plugin>__<name>` from the first prompt.
- `{ result: "<text>" }` reaches it as the tool's result, verbatim. `text` and `isError` on a
  hook's own answer are ignored, and a `result` that is neither a string nor content blocks
  becomes an error naming the output shape. That is why `callResult` sends the outcome's text,
  not its data.
- `{ deny: "<text>" }` reaches it as `<tool_use_error><text></tool_use_error>` with `is_error`.
  `callResult` answers a declared error that way, and `dispatch` a handler that throws.
- A hook that throws is skipped. The model then reads that no `tool.call` hook answered, as an
  error.
- The `prompt.context` block is in the first user message under `# <PLUGIN>`.
