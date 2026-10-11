---
plugin: Sessions
label: Session read
parameters:
  session: Session id, id prefix (13+ characters avoid collisions) or .jsonl path
  line: 1-based journal line
  before: Messages to show before the line
  after: Messages to show after the line (from the start when no line)
  find: Case-insensitive text to search for
  user: Only the user's messages and ask answers
  thinking: Include the agent's thinking
  tools: Include tool calls and results
  raw: Return exact journal lines instead of readable text
---
Read an omp session journal (.jsonl) by session id, id prefix or path, and line. Read-only: it changes nothing. With only a line: that entry and what it relates to (the agent text a user's message answered, an ask with its options and what was picked or typed). before/after page by messages around the line (tool entries only with tools); find searches the session (from line when given); user keeps only the user's words; thinking/tools add the agent's thinking and tool calls; raw returns the exact journal lines (JSONL). The output ends with the next call to make. Use it to read, check or page through a session instead of opening the journal file, whose lines run to tens of thousands of characters.

For filtering it doesn't do (by role, tool, time, field, or across sessions), run jq or python over the journal file. A call with only a line prints the journal's path first; journals are under ~/.omp/agent/sessions/, one folder per project, named `<time>_<session id>.jsonl`. Each line is one JSON entry with `type` and `timestamp`. A message entry (`type` "message") has `message.role` ("user", "assistant", "toolResult", "developer") and `message.content`: a string, or a list of blocks of type "text" (`text`), "thinking" (`thinking`), "toolCall" (`name`, `arguments`) or "image"; a tool result also has `message.toolName`. Print only the fields you need, never whole lines, e.g. `jq -c 'select(.message.role == "user") | [.timestamp, .message.content]' <journal>`.
