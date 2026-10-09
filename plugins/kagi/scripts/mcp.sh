#!/bin/sh
# Starts kagi's MCP server through the plugin's bin/launcher, one folder up, with markdown output.
# KAGI_MCP_TOOLS, kagi's own allowlist (comma-separated tool names), picks the tools; unset or
# empty, it is set to the default: search, quick answers and news.
set -eu
if [ -z "${KAGI_MCP_TOOLS:-}" ]; then
  KAGI_MCP_TOOLS=kagi_auth_status,kagi_search,kagi_batch_search,kagi_quick
  KAGI_MCP_TOOLS=$KAGI_MCP_TOOLS,kagi_news,kagi_news_categories,kagi_news_chaos
  KAGI_MCP_TOOLS=$KAGI_MCP_TOOLS,kagi_news_filter_presets,kagi_news_search,kagi_smallweb
fi
export KAGI_MCP_TOOLS
here=$(dirname -- "$0") || {
  printf 'mcp.sh: cannot find the folder of %s\n' "$0" >&2
  exit 1
}
exec "$here/../bin/launcher" kagi mcp --default-output markdown
