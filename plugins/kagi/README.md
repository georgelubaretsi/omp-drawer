# kagi

Kagi web search for coding agents, with only the tools you choose. The plugin runs the
[kagi CLI](https://github.com/Microck/kagi-cli)'s MCP server (`kagi mcp`, markdown output),
which shows the agent only the tools named in `KAGI_MCP_TOOLS`. It adds the `kagi` skill
(searching, the CLI fallback, signing in) and, for omp, the always-on rule `web-search`: every
web search goes through Kagi.

The kagi CLI is pinned (`mise.toml`); `bin/launcher` runs the pinned build, downloading and
verifying it on first use (on Linux, the static build, which runs on any distribution, NixOS
included). `scripts/mcp.sh` starts the MCP server. `skills/kagi/scripts/kagi.sh` runs the CLI as
`kagi` from any working directory; the skill's CLI fallback uses it by its absolute path.

## Requirements

A Kagi account. Sign in once, from the plugin folder: `skills/kagi/scripts/kagi.sh auth` (a
wizard), or `skills/kagi/scripts/kagi.sh auth set --session-token <token or Session Link URL>`.
The sign-in lives in kagi's own config, shared by every kagi binary.

## Choosing tools

`KAGI_MCP_TOOLS`, kagi's own allowlist, set in the agent's environment, is a comma-separated
list of tool names. Unset or empty, the plugin sets it to the default: `kagi_auth_status`,
search, quick answers and news. Set, it replaces the default, so list the default tools too to
keep them. kagi refuses to start when the list names a tool it doesn't have.

The tools, grouped:

| Group | Tools | Default | Needs |
| --- | --- | --- | --- |
| status | `kagi_auth_status` | yes | |
| search | `kagi_search`, `kagi_batch_search` | yes | |
| quick answers | `kagi_quick` | yes | |
| news | `kagi_news`, `kagi_news_categories`, `kagi_news_chaos`, `kagi_news_filter_presets`, `kagi_news_search`, `kagi_smallweb` | yes | |
| API | `kagi_extract` | | an API key |
| legacy API | `kagi_fastgpt`, `kagi_enrich_web`, `kagi_enrich_news` | | a legacy API token |
| Assistant | `kagi_assistant_custom_get`, `kagi_assistant_custom_list`, `kagi_assistant_models`, `kagi_assistant_thread_export`, `kagi_assistant_thread_get`, `kagi_assistant_thread_list`, `kagi_summarize`, `kagi_translate` | | |
| account | `kagi_auth_check`, `kagi_custom_bang_get`, `kagi_custom_bang_list`, `kagi_history_list`, `kagi_history_stats`, `kagi_lens_get`, `kagi_lens_list`, `kagi_redirect_get`, `kagi_redirect_list`, `kagi_site_pref_list` | | |

For example, `KAGI_MCP_TOOLS=kagi_search,kagi_batch_search,kagi_extract` shows only search and
`kagi_extract`.

A tool that needs a key works only with it, so set the key when you enable the tool: the API
key in `KAGI_API_KEY` or with `skills/kagi/scripts/kagi.sh auth set --api-key <key>`, the legacy
API token in `KAGI_API_TOKEN` or with `auth set --api-token <token>`.
