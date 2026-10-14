// Generated from model.ftl by `bun run build`; edit model.ftl.
import { Catalog } from "../kit/core/model";

const SOURCE =
	"## The tern_lua tool: what it does, and what each argument is for.\n\nlua = Run Lua in the Tern window that holds this omp's pane, with `cx`: the window API Carly's lua tool has (Tern agents in other panes, not omp subagents; sessions and layout, block reads, git, SQLite, notebooks, boards, browser, canvas, hosts, settings, actions, toasts). The first returned value comes back as JSON; returning an Awaitable (e.g. `return cx.git:status(repo)`) waits for it. `state` is a table kept between calls; `print` output is returned. Each call must finish its synchronous work within Tern's 50 ms plugin budget. Read the `tern` skill before first use.\n    .code = Luau chunk; `cx`, `state` and `print` are in scope; `return` the value you want back\n    .timeout_s = Seconds to wait for the answer (default 130, max 600)\n\n## An answer: what was printed, the result as JSON, and Tern's note on it.\n\nanswer-printed =\n    printed:\n    { $printed }\nanswer-result =\n    result:\n    { $result }\nanswer-nil =\n    result:\n    nil\nanswer-note = note: { $note }\n# An answer longer than the tool returns, cut at its end.\nanswer-truncated =\n    { $text }\n    \u2026 truncated at { $max } of { $length } characters; return less (fields, a slice, a count)\n\n## What each error means.\n\n# The tool's own code failing (a bug, an unexpected error), and arguments its schema doesn't take.\nerror-crashed = tern_lua failed in the plugin: { $cause }\nerror-arguments = The arguments don't fit tern_lua: { $problem }\nerror-lua-error = Lua error: { $error }\nerror-cancelled = Cancelled before Tern ran the code.\nerror-not-loaded = The piebird-tern-bridge Tern plugin is not loaded: its data folder { $dir } does not exist. omp installs it when it starts in a Tern pane, so if omp just started, try again in a moment. Otherwise install it with: tern plugin install \"{ $pluginDir }\" --force. If Tern runs with TERN_CONFIG_DIR, give omp the same value.\nerror-unclaimed = No Tern window holding pane { $pane } (this omp's TERN_PANE) took the request, even after `tern plugin reload`; the code did not run. Is this pane's session open in a Tern window? Check `tern plugin list` and Tern's log.\nerror-unknown = Outcome unknown: { $cause ->\n        [cancelled] cancelled after a Tern window took the request\n        [stopped] the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed)\n       *[timedOut] no answer within { $seconds } s\n    }. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again.{ $reloaded ->\n        [yes] {\" \"}Tern's plugins were reloaded, so the next call can run (`state` was reset).{ $appNap ->\n            [yes] {\" \"}App Nap is on for Tern, which can throttle a background Tern past its 50 ms plugin budget: ask the user to run `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern.\n           *[no] {\"\"}\n        }\n       *[no] {\"\"}\n    }\nerror-too-large = The request is { $bytes } bytes once JSON-encoded; Tern reads at most { $max }. Nothing was sent. Split the code into smaller calls, or keep large data in a file and read it with tern.fs.read.\n# Failures of the bridge itself, outside an outcome.\nno-tern = the `tern` command was not found (set TERN_BIN)\nnull-answer = { $file } holds null, not an answer\n";

export type Messages = {
	"answer-nil": undefined;
	"answer-note": {
		note: string | number;
	};
	"answer-printed": {
		printed: string | number;
	};
	"answer-result": {
		result: string | number;
	};
	"answer-truncated": {
		length: string | number;
		max: string | number;
		text: string | number;
	};
	"error-arguments": {
		problem: string | number;
	};
	"error-cancelled": undefined;
	"error-crashed": {
		cause: string | number;
	};
	"error-lua-error": {
		error: string | number;
	};
	"error-not-loaded": {
		dir: string | number;
		pluginDir: string | number;
	};
	"error-too-large": {
		bytes: string | number;
		max: string | number;
	};
	"error-unclaimed": {
		pane: string | number;
	};
	"error-unknown": {
		appNap: string | number;
		cause: string | number;
		reloaded: string | number;
		seconds: string | number;
	};
	lua: undefined;
	"lua.code": undefined;
	"lua.timeout_s": undefined;
	"no-tern": undefined;
	"null-answer": {
		file: string | number;
	};
};

export const model = new Catalog<Messages>(SOURCE);
