---
description: Use the project's own tools and commands (dev shell, scripts, lockfiles, task runner, CI steps) instead of globally installed tools or ad-hoc commands; how to write AGENTS.md
---
# Project tooling

- First read how the project builds and checks itself: AGENTS.md, README, package scripts,
  Makefile or justfile, dev shell or tool-version files, CI workflows.
- Run checks the way CI runs them, with the versions the lockfiles pin.
- A missing tool goes into the project's own setup (dev shell, dev dependency, pinned tool
  list), not onto this machine globally.
- Don't make the project depend on one machine: no absolute personal paths, no personal
  config, no tools only you have installed.

## AGENTS.md

- Treat AGENTS.md as a README for agents: instructions, not a design spec. Nested folders may
  keep their own.
- Use these sections, omitting empty ones: a one- or two-sentence summary, `## Layout`,
  `## Commands` (a code block), `## Workflow`, `## Conventions`, `## Code Review Rules`,
  `## More detail`.
- One instruction per bullet, at most two lines, wrapped at 100 columns; numbers, not
  explanations. Keep the root file around 60 lines, nested ones around 30.
- Move detail into `docs/`, one short file per topic, and link it from `## More detail`.
- `## Code Review Rules`: 2–5 concise rules whose violation matters, each with a `Safe path:`.
  Leave mechanical checks to CI and linters.
- Describe what the project protects, who acts, where data crosses a boundary and what is out
  of scope in `docs/threat-model.md`.
