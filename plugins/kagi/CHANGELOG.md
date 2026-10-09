# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Kagi's MCP server (kagi CLI 0.21.1, pinned and downloaded on first use), showing only the
  tool groups chosen with `KAGI_TOOLS`: by default search, quick answers and news; the API,
  Assistant and account tools on request.
- Skill `kagi`: searching with the Kagi tools, the CLI fallback (its `scripts/kagi.sh` runs the
  pinned kagi from any working directory), signing in and enabling more tool groups.
- Rule `web-search` (in full, every agent): web searches go through Kagi, never another search
  engine or the built-in web search; pages are fetched with the agent's normal tool.

### Changed

- kagi CLI 0.22.0, which filters its MCP tools itself, so `mcp-overlay` is no longer needed.
  `KAGI_MCP_TOOLS`, kagi's own allowlist of tool names (comma-separated), replaces `KAGI_TOOLS`
  and its groups; unset or empty, the plugin shows the same default tools as before. A tool
  that needs an API key needs that key set when you enable it, in the environment or saved with
  `kagi auth set`.
- On Linux the plugin runs kagi's static builds, which work on any distribution, NixOS included.
