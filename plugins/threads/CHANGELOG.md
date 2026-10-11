# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The open threads in front of the agent: before a prompt, when the list changed (and after a
  compaction), the main agent gets a list of the project's open threads: each one's slug, whether
  it waits on you and with how many questions, when it was last updated (uncommitted or by its
  last commit), its next step and where its design lives. omp shows it in the chat as a
  `threads.list` card. Threads untouched for 10 days are counted, not listed, unless they have
  uncommitted changes; when the last one closes, a "no open threads" line replaces the list, and
  when no `.omp/threads.json` names a folder any more, a "no threads folder" line does. Renamed
  (`git mv`) threads, file names with spaces and Windows line ends are read. Subagents get nothing.
- The project names its threads folder in `.omp/threads.json` (`{"folder": "<path>"}`, relative
  to the folder holding `.omp/`, and may lie outside the project); nothing is guessed, and a
  project without the file gets no list. The list names the folder it read.
- Rule `threads` (always applied), one sentence: read the `threads` skill before opening, creating
  or updating a thread, and before switching topic or ending the session.
- Skill `threads`: the parts of a thread file the list reads (the folder named in
  `.omp/threads.json`, asking the user when there is none; one file per open thread, finished
  ones in `done/`; `next` and `area` in the front matter; questions under
  `## Open questions for you`), and guidance for the rest, which the agent shapes to the work:
  the user's words with where they said them, what is approved, ruled out or running, links
  rather than copies. Only the main agent writes threads, updating and committing them when their
  state changes, at the latest before switching topic or ending the session, and checks a
  thread's claims before reporting on it.
- The list's wording, and the reasons a thread file can't be read, are Markdown templates in
  `src/templates/`, filled with omp's own Handlebars: change the wording there, not in the code.
  A name a template uses that the code doesn't fill is an error, not blank text.
- Supported host: omp.
