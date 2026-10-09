# omp-drawer

Plugins for coding agents: [omp](https://github.com/can1357/oh-my-pi) first, Claude Code and
Codex where a plugin works there too, and the [Tern](https://docs.stencil.so/tern/) terminal.

| Plugin | What it gives you | Agents |
| --- | --- | --- |
| [agent-variants](plugins/agent-variants) | The `agent_variant_setup` tool: temporary project-scoped variants of an agent, with explicit model routing | omp |
| [kagi](plugins/kagi/README.md) | Kagi web search through Kagi's MCP server, showing only the tools you choose; the `kagi` skill and, for omp, the `web-search` rule | omp, Claude Code, Codex |
| [tern](plugins/tern) | The `tern_lua` tool, running Lua with Tern's window API in the Tern window holding omp's pane, and the `tern` skill | omp, with Tern |
| [workflow](plugins/workflow/README.md) | Rules on how to work (proportion, thinking before building, fixing corrections as classes, project tooling, changelogs, asking for decisions) and the `failure-classes` skill | omp |

## Install

Add this repository as a marketplace once, then install the plugins you want.

omp:

    omp plugin marketplace add georgelubaretsi/omp-drawer
    omp plugin install kagi@omp-drawer

Claude Code:

    claude plugin marketplace add georgelubaretsi/omp-drawer
    claude plugin install kagi@omp-drawer

Codex:

    codex plugin marketplace add georgelubaretsi/omp-drawer
    codex plugin add kagi@omp-drawer

The tern plugin also has a Tern half, installed into Tern:

    tern plugin install github.com/georgelubaretsi/omp-drawer/plugins/tern/tern-plugin

## Contributing

Issues and pull requests are welcome. This repository is exported from a private workspace, so a
pull request is applied there by hand, with credit to its author, and arrives here as a new
commit rather than as a merge.

## Development

Everything runs in the dev shell ([Nix](https://nixos.org/download/)):

    nix develop
    bun install
    bun run check                  # generated files, lint, format, typecheck, tests

[AGENTS.md](AGENTS.md) has the layout, commands and conventions. Tern's docs are not
redistributed here; `bun tools/sync-references.ts tern` fetches them into `reference/`.

## License

[MIT](LICENSE). `reference/agent-plugins/` is the Agent Plugins specification and schemas,
redistributed under their own licenses ([NOTICE](reference/agent-plugins/NOTICE.md)).
