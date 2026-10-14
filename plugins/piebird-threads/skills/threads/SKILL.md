---
name: threads
description: "Threads, the files that keep work in progress: where they live, the few parts the plugin reads, and how to keep them useful."
---

# Threads

A thread is a plain Markdown file that carries one line of work across sessions: what the user wants, where it stands, what comes next. Write it for whoever picks the work up next, often an agent with none of your context.

## What the plugin reads

The open-threads list needs these parts; the rest of the file is free.

- The folder is the plugin's `folder` setting, in the project's `.agents/piebird/settings.json` as `{"piebird-threads": {"folder": "<path>"}}`, relative to the project; a project may name it in `.omp/threads.json` as `{"folder": "<path>"}` instead. The open-threads list names the folder it read, so look these files up only to change it; most projects have only one of the two. If the project names none, ask the user where threads should live, and add the setting with the first thread.
- One `.md` file per open thread, directly in that folder; move it to `done/` when finished.
- Front matter with `next` (the next concrete step) and `area` (where the design lives, or `none`), one line each. Quote a value that contains `: `.
- Questions waiting on the user are `- ` items under `## Open questions for you`.
- Status isn't written anywhere: the list works it out from the folder, those questions and git. A thread with no commit for 10 days drops out of the list until it changes again.

## The rest is yours

Shape the file to fit the work. Usually worth keeping:

- The user's words where they set direction, approved or ruled something out, quoted with where they said them (session id, line) so they can be checked; `session_read` finds them.
- What is approved but not done, what was ruled out and why, what is running and how you know.
- Links to what the work produced, not copies. A decision that limits future work goes where the project records decisions.

Leave out what git or the code already says.

## Keeping threads honest

- Only the main agent writes threads; subagents report to it.
- Update a thread when its state changes in a way the next session needs, and at the latest before switching topic or ending the session. Commit the update: the list's times come from git.
- A thread is notes, not proof: before telling the user where something stands, check it against git, CI and running agents.
