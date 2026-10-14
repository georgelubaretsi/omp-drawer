## The tern_lua tool: what it does, and what each argument is for.

lua = Run Lua in the Tern window that holds this omp's pane, with `cx`: the window API Carly's lua tool has (Tern agents in other panes, not omp subagents; sessions and layout, block reads, git, SQLite, notebooks, boards, browser, canvas, hosts, settings, actions, toasts). The first returned value comes back as JSON; returning an Awaitable (e.g. `return cx.git:status(repo)`) waits for it. `state` is a table kept between calls; `print` output is returned. Each call must finish its synchronous work within Tern's 50 ms plugin budget. Read the `tern` skill before first use.
    .code = Luau chunk; `cx`, `state` and `print` are in scope; `return` the value you want back
    .timeout_s = Seconds to wait for the answer (default 130, max 600)

## An answer: what was printed, the result as JSON, and Tern's note on it.

answer-printed =
    printed:
    { $printed }
answer-result =
    result:
    { $result }
answer-nil =
    result:
    nil
answer-note = note: { $note }
# An answer longer than the tool returns, cut at its end.
answer-truncated =
    { $text }
    … truncated at { $max } of { $length } characters; return less (fields, a slice, a count)

## What each error means.

# The tool's own code failing (a bug, an unexpected error), and arguments its schema doesn't take.
error-crashed = tern_lua failed in the plugin: { $cause }
error-arguments = The arguments don't fit tern_lua: { $problem }
error-lua-error = Lua error: { $error }
error-cancelled = Cancelled before Tern ran the code.
error-not-loaded = The piebird-tern-bridge Tern plugin is not loaded: its data folder { $dir } does not exist. omp installs it when it starts in a Tern pane, so if omp just started, try again in a moment. Otherwise install it with: tern plugin install "{ $pluginDir }" --force. If Tern runs with TERN_CONFIG_DIR, give omp the same value.
error-unclaimed = No Tern window holding pane { $pane } (this omp's TERN_PANE) took the request, even after `tern plugin reload`; the code did not run. Is this pane's session open in a Tern window? Check `tern plugin list` and Tern's log.
error-unknown = Outcome unknown: { $cause ->
        [cancelled] cancelled after a Tern window took the request
        [stopped] the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed)
       *[timedOut] no answer within { $seconds } s
    }. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again.{ $reloaded ->
        [yes] {" "}Tern's plugins were reloaded, so the next call can run (`state` was reset).{ $appNap ->
            [yes] {" "}App Nap is on for Tern, which can throttle a background Tern past its 50 ms plugin budget: ask the user to run `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern.
           *[no] {""}
        }
       *[no] {""}
    }
error-too-large = The request is { $bytes } bytes once JSON-encoded; Tern reads at most { $max }. Nothing was sent. Split the code into smaller calls, or keep large data in a file and read it with tern.fs.read.
# Failures of the bridge itself, outside an outcome.
no-tern = the `tern` command was not found (set TERN_BIN)
null-answer = { $file } holds null, not an answer
