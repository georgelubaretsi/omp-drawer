# tern: what agents receive

Each tinted box, and each cell under "What the agent gets", is exactly what the agent receives; everything else is a note. All of it only inside Tern (`TERM_PROGRAM=tern`), on macOS or Linux, and not in a remote host's pane.

**Contents:** [Tool](#tool) · [Results](#results) · [Errors](#errors) · [Rules](#rules) · [Skills](#skills) · [All plugins](index.md)

## Tool

**Description**, sent in every model request:

{{toolDescription}}

**Parameters**, sent with it:

| Parameter | What the agent gets |
| --- | --- |
| `code` | {{parameters.code}} |
| `timeout_s` | {{parameters.timeout}} |

## Results

**When:** the Lua code ran and returned.

**Printed output and a returned table.** Call: `{{returned.call}}`

{{returned.output}}

**Nothing returned.** Call: `{{nothing.call}}`

{{nothing.output}}

**A value that isn't JSON** (the note comes from the Tern side):

{{notJson}}

**An answer over 60,000 characters** ends like this, after its first 60,000 characters:

{{truncated}}

## Errors

**When:** a call fails; the agent gets the error message.

| When | What the agent gets |
| --- | --- |
| The Tern half isn't installed | {{notLoaded}} |
| No Tern window took the request | {{unclaimed}} |
| Cancelled before Tern ran it | {{cancelled}} |
| The request is over 1 MiB | {{tooLarge}} |
| Outcome unknown: cancelled after a window took it | {{unknownCancelled}} |
| Outcome unknown: no answer within the timeout | {{unknownTimedOut}} |
| Outcome unknown: the window stopped listening, plugins reloaded | {{unknownStopped}} |
| The same, with App Nap on | {{unknownAppNap}} |
| A reload was needed and the `tern` command is missing | {{noTern}} |
| Tern's answer file held null | {{nullAnswer}} |
| Tern's callback had no window (from the Tern side) | {{noWindow}} |

**The Lua code failed**, after printing something:

{{luaError}}

{{rules}}

{{skills}}
