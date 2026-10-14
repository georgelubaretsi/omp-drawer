# piebird-sessions

Let your agent read past sessions: omp's, Claude Code's and Codex's. What did we decide
yesterday, what exactly did I say, what did the agent answer: the `session_read` tool finds it in
the session's journal, by session id and line, without the agent opening a file whose lines run to
tens of thousands of characters.

[![omp, Claude Code and Codex each find what an earlier session decided](../../demos/piebird-sessions/demo.webp)](../../demos/piebird-sessions/demo.mp4)

## Install

omp:

    omp plugin marketplace add georgelubaretsi/piebird
    omp plugin install piebird-sessions@piebird

Claude Code:

    claude plugin marketplace add georgelubaretsi/piebird
    claude plugin install piebird-sessions@piebird

Codex, ChatGPT and Claude on a Mac or a Windows PC: the piebird installer
([Install](../../README.md#install)), which puts the plugin's program in place with it.

## What it adds

- `session_read`: this project's sessions, newest first, with each one's title and first prompt;
  one entry and what it relates to (the message a reply answers, a question with its options and
  what you picked or typed); pages of messages around a line; a search; only your own words; or
  the raw lines. Each answer ends with the next call to make. It reads every agent's journals,
  whichever agent asks.
- A line telling the agent its own session id and journal, so it can cite where you said
  something: in omp, in the chat before the agent's first turn and after a fork or compaction; in
  Claude Code, in the conversation's context.

It reads; it never changes a journal. Journals of hundreds of megabytes are read as they stream,
never held whole.

[What the model sees](../../docs/model/piebird-sessions.md): the tool's description, its answers
and errors, and the session line, word for word, in each agent.
