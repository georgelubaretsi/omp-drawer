# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this plugin adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Rule `proportion` (in full, every agent): weigh each possible problem by how likely it is in
  real use, how much it would hurt and what handling it costs; leave what's unlikely and minor,
  and call work done when only such issues remain.
- Rule `proportion-review` (in full, the `reviewer` agent): report a finding only when acting
  on it is worth more than it costs. The README shows how to give Codex code review the same text.
- Rule `think-before-building` (in full, every agent): before a non-trivial change, find what
  already defines or solves it, state what must be true, and decide how it fails.
- Rule `recurring-corrections` (in full, every agent): weigh a correction first, then fix the
  class of the mistake rather than the one example, and stop to redesign when corrections repeat.
- Rule `ask-for-decisions` (in full, main agent only): don't ask what you can find out; explain
  and discuss in plain text and use the ask tool only for the final pick, each option saying what
  you get and what you give up; keep discussing in plain text when the user cancels the ask tool
  and writes instead; take a clear safe default and say so, continue agreed work without asking;
  record each answer where it belongs, the user's words quoted.
- Rule `project-tooling`: use the project's own dev shell, scripts, lockfiles and CI steps; write
  AGENTS.md as a README for agents (fixed sections, short bullets, detail in `docs/`, 2–5 code
  review rules each with a safe path, the threat model in `docs/threat-model.md`).
- Rule `changelog`: keep a CHANGELOG.md in Keep a Changelog format, updated in the same change;
  a project that never releases closes its Unreleased section into a dated monthly section at
  the first change of a new month.
- Skill `failure-classes`: ten general failure classes, each with its members and how to test them.
