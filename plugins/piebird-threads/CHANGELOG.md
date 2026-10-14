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
  when nothing names a folder any more, a "no threads folder" line does. Renamed
  (`git mv`) threads, file names with spaces and Windows line ends are read. Subagents get nothing.
- Setting "Threads folder" (`folder`, a path): where the project keeps its threads, in its
  `.agents/piebird/settings.json` (relative to the project), the person's
  `~/.agents/piebird/settings.json` (relative to the home folder) or an agent's own plugin
  settings. When it is empty, the project's `.omp/threads.json` (`{"folder": "<path>"}`,
  relative to the folder holding `.omp/`) names it. The folder may lie outside the project;
  nothing is guessed, and a project that names none gets no list. The list names the folder it
  read.
- In Claude Code, a mod (`com.anthropic.claudecode/`) puts the rule and the open threads in a
  block of the conversation's context, at its start and after compaction or `/clear`.
- For Codex, the skill.
- Rule `threads` (always applied), one sentence: read the `threads` skill before opening, creating
  or updating a thread, and before switching topic or ending the session.
- Skill `threads`: the parts of a thread file the list reads (the folder the setting names,
  asking the user when there is none; one file per open thread, finished
  ones in `done/`; `next` and `area` in the front matter; questions under
  `## Open questions for you`), and guidance for the rest, which the agent shapes to the work:
  the user's words with where they said them, what is approved, ruled out or running, links
  rather than copies. Only the main agent writes threads, updating and committing them when their
  state changes, at the latest before switching topic or ending the session, and checks a
  thread's claims before reporting on it.
- Every word the agent reads is in `core/model.ftl`; [what the model sees](../../docs/model/piebird-threads.md)
  shows the list and the rule in omp and Claude Code.
- Supported hosts: omp, Claude Code, Codex.
- README, with a demo video: omp lists the open threads, records your answer in one, and the
  list follows.

### Changed

- Renamed from `threads` to `piebird-threads`, one name for the folder, `plugin.json`,
  `package.json` and the catalog: install it as `piebird-threads@piebird`.
