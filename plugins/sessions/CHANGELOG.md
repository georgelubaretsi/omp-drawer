# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Tool `session_read` (read-only): reads an omp session journal by session id, id prefix or
  `.jsonl` path (also starting with `~`, as the session line shows it); a prefix several sessions
  share fails, listing at most 10 of them. With a line: that entry
  and the message it answered or followed; `before` and `after` page by messages around it;
  `find` searches the session; `user` keeps only the user's words; `thinking` and `tools` add the
  agent's thinking and tool calls; `raw` returns the exact journal lines. The journal is
  streamed, never loaded whole, and closed when a read stops early. Each answer ends with the next
  call to make, or says the session ends there when nothing the flags show follows. For filtering
  it doesn't do, its description tells the agent to run jq or python over the journal file, where
  journals are, and how their lines are shaped.
- Asks shown in full, from the question's line or the answer's: each question, its options with
  their descriptions, and what was picked or typed.
- The agent knows its own session: before a prompt, the main agent gets a line with the session
  id, its journal and the session it was forked from, again after a fork, a move or a compaction.
  omp shows it in the chat as a `sessions.self` card.
- Every text the plugin shows (the tool's description, its output, errors, the session line) is a
  Markdown template in `src/templates/`, filled with omp's own Handlebars: change the wording
  there, not in the code. A name a template uses that the code doesn't fill is an error, not
  blank text.
- Supported host: omp.
