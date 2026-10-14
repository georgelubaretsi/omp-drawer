# piebird-threads

Keep the project's open lines of work in front of your agent. A thread is a Markdown file, one per
line of work, in a folder you choose; the agent gets the list of open threads, which of them wait
on you, and the next step of each. omp gets it before your prompt, again whenever the list
changes; Claude Code at the start of a conversation and after compaction. Codex gets the skill.

[![omp lists the open threads and records an answer in one; Claude Code and Codex find the same threads](../../demos/piebird-threads/demo.webp)](../../demos/piebird-threads/demo.mp4)

## Install

    omp plugin marketplace add georgelubaretsi/piebird
    omp plugin install piebird-threads@piebird

Claude Code: `claude plugin marketplace add georgelubaretsi/piebird`, then
`claude plugin install piebird-threads@piebird`. Codex: `codex plugin marketplace add
georgelubaretsi/piebird`, then `codex plugin add piebird-threads@piebird`. ChatGPT and Claude
on a Mac or a Windows PC: the piebird installer ([Install](../../README.md#install)).

Then name the folder in the project's `.agents/piebird/settings.json`, relative to the project:

    { "piebird-threads": { "folder": "notes/threads" } }

A project's `.omp/threads.json` (`{ "folder": "notes/threads" }`) still works when the setting is
empty. Your own `~/.agents/piebird/settings.json` and an agent's own plugin settings can name a
folder too, and win over the project's. Without any, the plugin stays quiet; the agent adds the
setting with your first thread when you ask it to keep one.

## A thread

    ---
    next: decide how to round discounts
    area: src/cart.ts
    ---
    # Checkout totals

    ## Open questions for you

    - Round discounts down, or to the nearest cent?

The list reads only the front matter (`next`, `area`), the questions under
`## Open questions for you`, and git: when the file last changed, and whether that change is
committed. A thread untouched for 10 days drops out of the list until it changes; a finished one
moves to `done/`. The rest of the file is yours.

The `piebird-threads` rule has the agent read the `threads` skill before it opens or updates a
thread, and update it before you switch topic or end the session. Codex, which gets no rule, finds
the same in the skill's description.

[What the model sees](../../docs/model/piebird-threads.md): the list, the rule and the skill, word
for word, in omp and Claude Code.
