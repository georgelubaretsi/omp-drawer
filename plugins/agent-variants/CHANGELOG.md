# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Tool `agent_variant_setup`: when you ask to run work with a particular model, provider, cost
  limit or thinking level, it creates a temporary copy of an existing agent (such as `task`,
  `reviewer` or `designer`) routed to that model. It configures the variant; you then use it.
- Model matching from a natural request or exact selector, with fallback models; free and
  subscription-backed routes are used first, and paid per-token models need your explicit
  approval, with their prices shown.
- Project scope by default (`.omp/` in the repository), written only after the agent confirms
  the project allows it; global scope only when you ask for it.
- Protects your configuration: refuses to overwrite uncommitted `.omp` changes, existing
  non-temporary agents or roles, and updates an existing temporary variant only when asked.
- Lists the project's temporary agents, with their source agent and requested model, when a
  session starts.
- Supported host: omp.
