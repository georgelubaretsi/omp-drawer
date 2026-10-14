# piebird-kagi-search

Kagi search for coding agents, with your own Kagi account: web search, quick answers, the News
tab, Kagi News and the Small Web feed. The tools run inside omp and Claude Code, and through the
plugin's program in Codex and the desktop apps; the plugin's vault, `kagi-vault`, a small program
of its own, keeps your Kagi session and talks to Kagi. It adds the `kagi` skill (the tools, raw
mode, signing in, the vault's command as a fallback) and one setting: how much your agent relies
on Kagi over its own web search.

[![omp answers a question about this week's software with Kagi search](../../demos/piebird-kagi-search/demo.webp)](../../demos/piebird-kagi-search/demo.mp4)

## Install

The plugin needs its vault, a program built for each system, and a marketplace carries only the
repository's files. So it comes with the piebird installer ([Install](../../README.md#install)),
which puts the vault and the plugin's program in place, for every agent it finds: omp, Claude
Code, Codex, ChatGPT and Claude. Installed with `omp plugin install` or `claude plugin install`,
it arrives without them, and its tools answer that the vault didn't answer. In a clone of this
repository, `bun run build` builds them into `native/` (it needs Go,
[docs/manifests.md](../../docs/manifests.md#native-programs)).

## Signing in

You need a Kagi subscription. Kagi offers no API for searching with it, so the plugin signs in
as your browser does, with your Session Link (in Kagi's settings, under Account). The first
search on a computer without a session opens a page on 127.0.0.1 in your browser: it sends you
to your Session Link, you paste it there, and the search answers. The link never passes through
the agent's chat. Without a browser, run `native/kagi-vault sign-in --link` from the plugin's
folder and paste the link when it asks: it never goes on the command line, where your shell's
history would keep it.

The session is kept in your system's secret store: the macOS Keychain, Windows Credential
Manager, or your keyring (the Secret Service) on Linux, and where Linux runs no keyring, a file
only you can read (`piebird/kagi-vault/secrets.json` in your config folder). On macOS, only the
vault reads it without asking you. `KAGI_SESSION_TOKEN` overrides it, for CI and containers.
`native/kagi-vault status` says whether the session works; `native/kagi-vault sign-out` forgets it.
On Windows and Linux, any program running as you can read it from the store; what the vault
guards, and what it can't, is in [Security](../../docs/security.md).

## Tools

| Tool | What it does |
| --- | --- |
| `kagi_search` | Web search, with an optional period or date range |
| `kagi_batch_search` | Up to 10 web searches at once |
| `kagi_quick` | Kagi's Quick Answer, with its sources |
| `kagi_news_search` | The News tab of kagi.com |
| `kagi_news`, `kagi_news_categories`, `kagi_news_chaos`, `kagi_news_filter_presets` | Kagi News: today's stories in a category, the categories, the chaos index, the content filters |
| `kagi_smallweb` | The newest posts of the Small Web feed |
| `kagi_auth_status` | Whether a session is kept and works |
| `kagi_raw_read`, `kagi_raw_write` | Raw mode: any request to Kagi, as it is |

omp and Claude Code load the first three up front and the rest when the agent looks for them.

For what the tools don't cover, raw mode:

- Every tool takes `format: "json"`, which answers with its data as JSON fields.
- `kagi_raw_read` sends a GET to any page of kagi.com (signed in) or of news.kagi.com and
  returns the response as it came; `kagi_raw_write` sends any other request, which may change
  your account. Your Assistant threads, lenses and settings are reachable this way. Whether
  your agent asks you first is up to its permission settings. A response body over 32 KB is
  saved in your cache folder for a day; the agent gets its path, its size and how it starts.

[What the model sees](../../docs/model/piebird-kagi-search.md): each tool's description, its
answers and errors, and the instructions about searching, word for word, in omp, Claude Code and
Codex.

## Settings

**Search with Kagi** decides how much your agent relies on Kagi:

| Choice | What it does |
| --- | --- |
| Kagi first (the default) | The agent searches with Kagi. Its own web search stays out of the way until a Kagi search fails in the conversation. |
| Kagi only | Every web search goes through Kagi; the agent's own web search is refused even when Kagi fails. |
| Kagi offered | Kagi is one more way to search; nothing is hidden or refused. |

Choose for every agent with `native/piebird-kagi-search settings` (run from the plugin's
folder), which opens your settings in the browser, or in `~/.agents/piebird/settings.json`:

    { "piebird-kagi-search": { "search": "only" } }

A project can choose for itself in its own `.agents/piebird/settings.json`, and yours wins over
it. An agent's own settings choose for that agent alone and win over both: in omp,
`omp plugin config set piebird-kagi-search search only`; in Claude Code,
`/plugin configure piebird-kagi-search@piebird`. Agents take a change up in their next session.

Every agent is told how to search by the choice. To keep its own web search out of the way, omp
hides `web_search`, and Claude Code (2.1.287 or later) keeps `WebSearch` behind tool search and
refuses calls to it. A call the agent got wrong doesn't count as Kagi failing; Kagi out of reach,
a sign-in it needs, or a vault that doesn't answer does. Codex's own web search still runs: the plugin's hook that refuses it waits
for Codex to run plugin hooks.

## How it works

The tools, the setting and every word the model reads are TypeScript in `core/`, run by each
agent's part: `src/` in omp, the mod in `com.anthropic.claudecode/` in Claude Code, the program in
`program/` for Codex and the desktop apps. Each asks the vault, a Go program
([`cmd/kagi-vault/`](../../cmd/kagi-vault/), its Kagi client in
[`internal/kagi/`](../../internal/kagi/)), to perform a named operation, and the vault answers
with Kagi's results, never the session. Both are built for macOS and Linux (arm64 and x64) and
Windows (x64) into `native/`: nothing is downloaded or installed when they run. The vault reads
Kagi's result pages and Quick Answer stream as the web app does, sending your installed Chrome's
User-Agent and client hints; Kagi News and the Small Web feed are public. When Kagi changes its
pages, the vault follows; its tests read pages captured from Kagi
(`internal/kagi/kagitest/testdata/`).

## Command line

`native/kagi-vault` (`kagi-vault.exe` on Windows) signs in (`sign-in`, `sign-in --link`), signs
out and says whether the session works (`status`). `call <operation>` performs a tool's operation
with its arguments as JSON on stdin and prints Kagi's data as JSON:

    echo '{"query": "bun 2", "time": "week"}' | native/kagi-vault call search
