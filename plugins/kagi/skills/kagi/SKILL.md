---
name: kagi
description: Web search through Kagi - the Kagi MCP tools first, the plugin's kagi CLI when they are missing or erroring; signing in and enabling more Kagi tools. Use for every web search.
---
# Kagi

## Search with the MCP tools

The `kagi` MCP server's tools (the host may prefix their names). They return markdown.

- `kagi_search`: one query (`query`); optional `time` (`day`, `week`, `month`, `year`),
  `from_date` / `to_date` (`YYYY-MM-DD`), `limit`.
- `kagi_batch_search`: several queries at once (`queries`), same filters.
- `kagi_quick`: a short answer built from live results.
- News: `kagi_news_search` searches news; `kagi_news`, `kagi_news_categories`,
  `kagi_news_chaos`, `kagi_news_filter_presets` and `kagi_smallweb` read Kagi News and the
  Small Web feed.

Fetch the pages a search finds with your normal read or fetch tool, not with Kagi tools.

## Fallback: the CLI

Only when those tools are missing or erroring. `scripts/kagi.sh` in this skill's folder runs
the plugin's pinned `kagi`. Run it by its absolute path: the folder this SKILL.md was loaded
from, plus `scripts/kagi.sh` (your working directory is the user's project):

    <skill dir>/scripts/kagi.sh search --format markdown --limit 10 "<query>"
    <skill dir>/scripts/kagi.sh batch --format markdown --limit 10 "<query>" "<query>"

Both take `--time day|week|month|year` and `--from-date` / `--to-date YYYY-MM-DD`;
`search --news` searches news. When the CLI fails too, report both failures; don't
switch to another search engine or a built-in web search.

## Signing in

Kagi needs a Kagi account; the user signs in once, through the same script:

- `<skill dir>/scripts/kagi.sh auth` starts the setup wizard (interactive: ask the user to
  run it).
- `<skill dir>/scripts/kagi.sh auth set --session-token <token or Session Link URL>` saves a
  session.
- `<skill dir>/scripts/kagi.sh auth status` shows what is configured; `auth check` validates it.

## More tools

`KAGI_MCP_TOOLS`, set where the agent starts, lists the tools the server shows, by name,
comma-separated. It replaces the default, so list the default tools too to keep them; a name
kagi doesn't have stops the server from starting. The tools, grouped:

- Default: `kagi_auth_status`; search: `kagi_search`, `kagi_batch_search`; quick answers:
  `kagi_quick`; news: `kagi_news`, `kagi_news_categories`, `kagi_news_chaos`,
  `kagi_news_filter_presets`, `kagi_news_search`, `kagi_smallweb`.
- API, needs an API key: `kagi_extract`.
- Legacy API, needs a legacy API token: `kagi_fastgpt`, `kagi_enrich_web`, `kagi_enrich_news`.
- Assistant: `kagi_assistant_custom_get`, `kagi_assistant_custom_list`, `kagi_assistant_models`,
  `kagi_assistant_thread_export`, `kagi_assistant_thread_get`, `kagi_assistant_thread_list`,
  `kagi_summarize`, `kagi_translate`.
- Account: `kagi_auth_check`, `kagi_custom_bang_get`, `kagi_custom_bang_list`,
  `kagi_history_list`, `kagi_history_stats`, `kagi_lens_get`, `kagi_lens_list`,
  `kagi_redirect_get`, `kagi_redirect_list`, `kagi_site_pref_list`.

A tool that needs a key works only with it: enabling one means setting its key too, the API key
in `KAGI_API_KEY` or with `<skill dir>/scripts/kagi.sh auth set --api-key <key>`, the legacy
token in `KAGI_API_TOKEN` or with `auth set --api-token <token>`. The server reads
`KAGI_MCP_TOOLS` when it starts, so a change needs the agent restarted.
