---
description: Every project keeps a CHANGELOG.md (Keep a Changelog 2.0.0); every change users would notice adds an entry in the same change
---
# Changelog

Required in every project (the owner's decision; a project's own policy doesn't remove it):

- A CHANGELOG.md per independently versioned thing, at its root; one at the repo root when
  the repo is released as a whole. A project that never releases still keeps one.
- Keep a Changelog 2.0.0 format: entries under `## [Unreleased]`, in Added, Changed,
  Deprecated, Removed, Fixed or Security, written for the people using it (what changed for
  them, not which files moved). Breaking changes start with **Breaking:**.
- A project that never releases closes its Unreleased section into a dated monthly section,
  `[YYYY.MM] - YYYY-MM-DD` (the month's last day), at the first change of a new month.
- The entry lands in the same change. Counts: behavior, interfaces, configuration, install
  steps, security fixes; refactors, tests and CI only when users would notice. A change with
  nothing notable says so explicitly (default marker: a `Changelog: none` line in the commit
  message).
- No CHANGELOG.md yet: create it the first time something notable changes, with the header
  below. Don't backfill old history.
- If the project checks its changelog, run that check (rule: project-tooling).

Defaults (where the project already has a convention, follow it):

- Version format and scheme: release headings are `[<version>] - YYYY-MM-DD` with the
  version written the project's way. The header's versioning sentence names the scheme the
  project follows (Semantic Versioning, CalVer, …); leave it out when it follows none or
  never releases.
- Releasing: in the same commit as the version bump, rename `[Unreleased]` to the release
  heading and start a new empty `[Unreleased]`.
- Compare links: once releases are tagged on a host with a compare view, end the file with
  `[Unreleased]: <repo>/compare/<latest tag>...HEAD` and one
  `[<version>]: <repo>/compare/<previous tag>...<tag>` per release (the first links to its
  tag); a release adds its link and moves the Unreleased base. Tag names come from the
  project's existing tags or release docs; with none yet, `v<version>`, or
  `<name>-v<version>` in a repo with several versioned things.
- The marker for "nothing notable" (a commit trailer, a PR label, …).

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/2.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
```
