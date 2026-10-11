# kagi: what agents receive

Each tinted box is exactly what the agent receives; everything else is a note.

**Contents:** [MCP tools](#mcp-tools) · [Rules](#rules) · [Skills](#skills) · [All plugins](index.md)

## MCP tools

**When:** in every session while the kagi plugin is on, omp offers the tools of the MCP server the plugin starts: `scripts/mcp.sh` runs `kagi mcp` from the kagi CLI, at the version `bin/pins` pins, and the server offers only the tools named in `KAGI_MCP_TOOLS` (the default list is in `scripts/mcp.sh`). Their names, descriptions and results come from the kagi CLI, not from this repository, so they aren't shown here.

## Rules

### `web-search`

**When:** always, in every session's system prompt while the kagi plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Web search
>
> \- Search the web through Kagi (skill: kagi): the Kagi MCP tools first; the skill's CLI\
>   fallback only when those tools are missing or erroring.\
> \- When both fail, report it. Never switch to another search engine or a built-in web search.\
> \- Kagi is for searching. Fetch page contents (result URLs, URLs the user gives) with your\
>   normal read or fetch tool, not with Kagi tools.

## Skills

### `kagi`

**In the skills list**, in every session's system prompt while the kagi plugin is on (omp may shorten the description):

> [!NOTE]
> \- kagi: Web search through Kagi - the Kagi MCP tools first, the plugin's kagi CLI when they are missing or erroring; signing in and enabling more Kagi tools. Use for every web search.

**When the agent reads `skill://kagi`**, which omp tells it to do first when the description matches the task. The whole file, as the agent gets it:

> [!NOTE]
> \---\
> name: kagi\
> description: Web search through Kagi - the Kagi MCP tools first, the plugin's kagi CLI when they are missing or erroring; signing in and enabling more Kagi tools. Use for every web search.\
> \---\
> \# Kagi
>
> \#\# Search with the MCP tools
>
> The \`kagi\` MCP server's tools (the host may prefix their names). They return markdown.
>
> \- \`kagi\_search\`: one query (\`query\`); optional \`time\` (\`day\`, \`week\`, \`month\`, \`year\`),\
>   \`from\_date\` / \`to\_date\` (\`YYYY-MM-DD\`), \`limit\`.\
> \- \`kagi\_batch\_search\`: several queries at once (\`queries\`), same filters.\
> \- \`kagi\_quick\`: a short answer built from live results.\
> \- News: \`kagi\_news\_search\` searches news; \`kagi\_news\`, \`kagi\_news\_categories\`,\
>   \`kagi\_news\_chaos\`, \`kagi\_news\_filter\_presets\` and \`kagi\_smallweb\` read Kagi News and the\
>   Small Web feed.
>
> Fetch the pages a search finds with your normal read or fetch tool, not with Kagi tools.
>
> \#\# Fallback: the CLI
>
> Only when those tools are missing or erroring. \`scripts/kagi.sh\` in this skill's folder runs\
> the plugin's pinned \`kagi\`. Run it by its absolute path: the folder this SKILL.md was loaded\
> from, plus \`scripts/kagi.sh\` (your working directory is the user's project):
>
>     \<skill dir\>/scripts/kagi.sh search --format markdown --limit 10 "\<query\>"\
>     \<skill dir\>/scripts/kagi.sh batch --format markdown --limit 10 "\<query\>" "\<query\>"
>
> Both take \`--time day\|week\|month\|year\` and \`--from-date\` / \`--to-date YYYY-MM-DD\`;\
> \`search --news\` searches news. When the CLI fails too, report both failures; don't\
> switch to another search engine or a built-in web search.
>
> \#\# Signing in
>
> Kagi needs a Kagi account; the user signs in once, through the same script:
>
> \- \`\<skill dir\>/scripts/kagi.sh auth\` starts the setup wizard (interactive: ask the user to\
>   run it).\
> \- \`\<skill dir\>/scripts/kagi.sh auth set --session-token \<token or Session Link URL\>\` saves a\
>   session.\
> \- \`\<skill dir\>/scripts/kagi.sh auth status\` shows what is configured; \`auth check\` validates it.
>
> \#\# More tools
>
> \`KAGI\_MCP\_TOOLS\`, set where the agent starts, lists the tools the server shows, by name,\
> comma-separated. It replaces the default, so list the default tools too to keep them; a name\
> kagi doesn't have stops the server from starting. The tools, grouped:
>
> \- Default: \`kagi\_auth\_status\`; search: \`kagi\_search\`, \`kagi\_batch\_search\`; quick answers:\
>   \`kagi\_quick\`; news: \`kagi\_news\`, \`kagi\_news\_categories\`, \`kagi\_news\_chaos\`,\
>   \`kagi\_news\_filter\_presets\`, \`kagi\_news\_search\`, \`kagi\_smallweb\`.\
> \- API, needs an API key: \`kagi\_extract\`.\
> \- Legacy API, needs a legacy API token: \`kagi\_fastgpt\`, \`kagi\_enrich\_web\`, \`kagi\_enrich\_news\`.\
> \- Assistant: \`kagi\_assistant\_custom\_get\`, \`kagi\_assistant\_custom\_list\`, \`kagi\_assistant\_models\`,\
>   \`kagi\_assistant\_thread\_export\`, \`kagi\_assistant\_thread\_get\`, \`kagi\_assistant\_thread\_list\`,\
>   \`kagi\_summarize\`, \`kagi\_translate\`.\
> \- Account: \`kagi\_auth\_check\`, \`kagi\_custom\_bang\_get\`, \`kagi\_custom\_bang\_list\`,\
>   \`kagi\_history\_list\`, \`kagi\_history\_stats\`, \`kagi\_lens\_get\`, \`kagi\_lens\_list\`,\
>   \`kagi\_redirect\_get\`, \`kagi\_redirect\_list\`, \`kagi\_site\_pref\_list\`.
>
> A tool that needs a key works only with it: enabling one means setting its key too, the API key\
> in \`KAGI\_API\_KEY\` or with \`\<skill dir\>/scripts/kagi.sh auth set --api-key \<key\>\`, the legacy\
> token in \`KAGI\_API\_TOKEN\` or with \`auth set --api-token \<token\>\`. The server reads\
> \`KAGI\_MCP\_TOOLS\` when it starts, so a change needs the agent restarted.
