# threads: what agents receive

Each tinted box is exactly what the agent receives; everything else is a note.

**Contents:** [The list](#the-list) · [Rules](#rules) · [Skills](#skills) · [All plugins](index.md)

## The list

**When:** before the main agent's turn after a user prompt, in a project whose `.omp/threads.json` names a threads folder, when the list changed since the last one (and after a compaction). The model gets it as a `developer` message; you see it in the chat (in omp's own UI, a card headed `threads.list`).

The sample project keeps private docs in `notes/` (its own git repository) and its `.omp/threads.json` is `{"folder": "notes/threads"}`. It has two threads committed this week (one with two open questions), one with uncommitted changes, one untouched for 20 days, and a file without front matter:

> [!NOTE]
> Open threads in notes/threads/ (3; 1 dormant not shown):\
> \- image-uploads · waiting on you (1 question) · updated 10-11 06:00 (uncommitted) · next: pick a storage bucket · notes/uploads.md\
> \- checkout-totals · waiting on you (2 questions) · updated 10-09 09:00 · next: decide how to round discounts\
> \- response-cache · updated 10-10 09:00 · next: measure the hit rate in staging · RFC 4 §3\
> \- unreadable: draft.md: no front matter

**Once, after the last open thread closes:**

> [!NOTE]
> No open threads in notes/threads/.

**Once, when no `.omp/threads.json` names a folder any more** (the file removed, or the session moved), after a list was sent:

> [!NOTE]
> No threads folder here: no .omp/threads.json names one, so earlier thread lists no longer apply.

## Rules

### `threads`

**When:** always, in every session's system prompt while the threads plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Threads
>
> Threads keep work in progress, one file per line of work. Read the \`threads\` skill before you open, create or update one, and before switching topic or ending the session.

## Skills

### `threads`

**In the skills list**, in every session's system prompt while the threads plugin is on (omp may shorten the description):

> [!NOTE]
> \- threads: Threads, the files that keep work in progress: where they live, the few parts the plugin reads, and how to keep them useful.

**When the agent reads `skill://threads`**, which omp tells it to do first when the description matches the task. The whole file, as the agent gets it:

> [!NOTE]
> \---\
> name: threads\
> description: "Threads, the files that keep work in progress: where they live, the few parts the plugin reads, and how to keep them useful."\
> \---
>
> \# Threads
>
> A thread is a plain Markdown file that carries one line of work across sessions: what the user wants, where it stands, what comes next. Write it for whoever picks the work up next, often an agent with none of your context.
>
> \#\# What the plugin reads
>
> The open-threads list needs these parts; the rest of the file is free.
>
> \- The folder is named in \`.omp/threads.json\` as \`{"folder": "\<path\>"}\`. If the project has none, ask the user where threads should live, and add that file with the first thread.\
> \- One \`.md\` file per open thread, directly in that folder; move it to \`done/\` when finished.\
> \- Front matter with \`next\` (the next concrete step) and \`area\` (where the design lives, or \`none\`), one line each. Quote a value that contains \`: \`.\
> \- Questions waiting on the user are \`- \` items under \`\#\# Open questions for you\`.\
> \- Status isn't written anywhere: the list works it out from the folder, those questions and git. A thread with no commit for 10 days drops out of the list until it changes again.
>
> \#\# The rest is yours
>
> Shape the file to fit the work. Usually worth keeping:
>
> \- The user's words where they set direction, approved or ruled something out, quoted with where they said them (session id, line) so they can be checked; \`session\_read\` finds them.\
> \- What is approved but not done, what was ruled out and why, what is running and how you know.\
> \- Links to what the work produced, not copies. A decision that limits future work goes where the project records decisions.
>
> Leave out what git or the code already says.
>
> \#\# Keeping threads honest
>
> \- Only the main agent writes threads; subagents report to it.\
> \- Update a thread when its state changes in a way the next session needs, and at the latest before switching topic or ending the session. Commit the update: the list's times come from git.\
> \- A thread is notes, not proof: before telling the user where something stands, check it against git, CI and running agents.
