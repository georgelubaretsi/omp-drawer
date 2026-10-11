# threads: what agents receive

Each tinted box is exactly what the agent receives; everything else is a note.

**Contents:** [The list](#the-list) · [Rules](#rules) · [Skills](#skills) · [All plugins](index.md)

## The list

**When:** before the main agent's turn after a user prompt, in a project whose `.omp/threads.json` names a threads folder, when the list changed since the last one (and after a compaction). The model gets it as a `developer` message; you see it in the chat (in omp's own UI, a card headed `threads.list`).

The sample project keeps private docs in `notes/` (its own git repository) and its `.omp/threads.json` is `{"folder": "notes/threads"}`. It has two threads committed this week (one with two open questions), one with uncommitted changes, one untouched for 20 days, and a file without front matter:

{{openThreads}}

**Once, after the last open thread closes:**

{{none}}

**Once, when no `.omp/threads.json` names a folder any more** (the file removed, or the session moved), after a list was sent:

{{noFolder}}

{{rules}}

{{skills}}
