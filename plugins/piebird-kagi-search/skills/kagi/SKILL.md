---
name: kagi
description: Web search through Kagi - the Kagi tools first, the plugin's kagi-vault command when they are missing or erroring; signing in. Use for every web search.
---
# Kagi

## Search with the tools

The Kagi tools (the agent may prefix their names). They return markdown.

- `kagi_search`: one query (`query`); optional `time` (`day`, `week`, `month`, `year`) or
  `from_date` / `to_date` (`YYYY-MM-DD`), and `limit` (default 10).
- `kagi_batch_search`: up to 10 queries at once (`queries`), same filters.
- `kagi_quick`: a short answer written from live results, with its sources.
- `kagi_news_search`: the News tab (`query`, optional `freshness`: `day`, `week`, `month`).
- Kagi News: `kagi_news` (today's stories in a `category`, default world; `hide` leaves out
  preset topics or keywords), `kagi_news_categories`, `kagi_news_chaos`,
  `kagi_news_filter_presets`; `kagi_smallweb`: new posts from personal sites.
- `kagi_auth_status`: whether a Kagi session is kept and works.

Fetch the pages a search finds with your normal read or fetch tool, not with Kagi tools.

## When the tools fall short: raw mode

- `format: "json"` on any tool returns its data as JSON fields instead of markdown, to filter,
  count or pass on in code.
- `kagi_raw_read` (`request`): GET any page of kagi.com, signed in, or of news.kagi.com, and get
  the status, type and body as they came. `request` is a path (`/html/search?q=x&l=<lens>`, a
  further result page, a settings page) or an https URL on either host (Kagi News' JSON API).
- `kagi_raw_write` (`request`): a request that may change the person's Kagi account, or needs
  another method than GET: `POST /path` (or a full URL), optional header lines, a blank line,
  then the body. Only for a change the person asked for.
- A raw body over 32 KB comes as a saved file: its path, its size and how it starts. Read parts
  of it with grep, jq or a range of lines.

## Signing in

The first search on a computer without a Kagi session opens a page in the person's browser and
waits for them to sign in there (they copy their Session Link from Kagi and paste it on the
page); then the search answers. If it times out first, the tool says so with the page's
address: tell the person, wait for them, then search again. Never ask for the Session Link in
the chat.

## Fallback: the vault's command

Only when the tools are missing or erroring. The plugin's vault, which keeps the Kagi session,
is `native/kagi-vault` in the plugin folder, two folders above this SKILL.md's folder
(`<skill dir>/../../native/kagi-vault`; on Windows, `kagi-vault.exe` in that folder). Run it by
its absolute path: `call <operation>` takes the tool's arguments as JSON on stdin and prints
`{"output": ...}` or `{"error": {"id": ..., "variables": ...}}`. The operations are the tools'
names without `kagi_` and with `-` for `_` (`search`, `batch-search`, `quick`, `news-search`,
`news`, `raw-read`, ...), except `kagi_auth_status`, which is `status`:

    echo '{"query": "<query>", "time": "week", "limit": 10}' | "<plugin dir>/native/kagi-vault" call search
    echo '{"queries": ["<query>", "<query>"]}' | "<plugin dir>/native/kagi-vault" call batch-search
    echo '{"request": "/html/search?q=<query>"}' | "<plugin dir>/native/kagi-vault" call raw-read

`status` says whether a session is kept and works; `sign-in` opens the sign-in page and waits.
On a computer with no browser, the person runs `sign-in --link` in a terminal and pastes the link
themselves. When the command fails too, report both failures.

## Settings

How much to rely on Kagi over other search tools is the person's choice, the setting "Search
with Kagi" (`only`, `first`, `offered`), and the instructions you get with the Kagi tools follow
it. They choose it in the agent's own plugin settings, or for every agent in
`~/.agents/piebird/settings.json` (`{"piebird-kagi-search": {"search": "first"}}`); a project
can set it in its own `.agents/piebird/settings.json`. When they ask to change it, tell them
where. Don't change a setting yourself.
