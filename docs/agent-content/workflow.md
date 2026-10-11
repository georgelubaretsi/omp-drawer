# workflow: what agents receive

Each tinted box is exactly what the agent receives; everything else is a note. The plugin's skill is on [its own page](workflow-skills.md).

**Contents:** [Rules](#rules) · [Skills](workflow-skills.md) · [All plugins](index.md)

## Rules

### `ask-for-decisions`

**When:** always, in every session's system prompt while the workflow plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Ask for decisions
>
> \- Don't ask what you can find out yourself.\
> \- Explain and discuss in plain text; use the ask tool only for the final pick.\
> \- Options in plain words: what you get, what you give up.\
> \- If the user cancels the ask tool and writes instead, keep discussing in plain text.\
> \- Clear safe default: take it and say so. Agreed work: just continue.

### `changelog`

**In the rules list**, in every session's system prompt while the workflow plugin is on:

> [!NOTE]
> \- changelog (): Every project keeps a CHANGELOG.md (Keep a Changelog 2.0.0); every change users would notice adds an entry in the same change

**When the agent reads `rule://changelog`**, when its work matches the description. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Changelog
>
> Required in every project (the owner's decision; a project's own policy doesn't remove it):
>
> \- A CHANGELOG.md per independently versioned thing, at its root; one at the repo root when\
>   the repo is released as a whole. A project that never releases still keeps one.\
> \- Keep a Changelog 2.0.0 format: entries under \`\#\# \[Unreleased\]\`, in Added, Changed,\
>   Deprecated, Removed, Fixed or Security, written for the people using it (what changed for\
>   them, not which files moved). Breaking changes start with \*\*Breaking:\*\*.\
> \- A project that never releases closes its Unreleased section into a dated monthly section,\
>   \`\[YYYY.MM\] - YYYY-MM-DD\` (the month's last day), at the first change of a new month.\
> \- The entry lands in the same change. Counts: behavior, interfaces, configuration, install\
>   steps, security fixes; refactors, tests and CI only when users would notice. A change with\
>   nothing notable says so explicitly (default marker: a \`Changelog: none\` line in the commit\
>   message).\
> \- No CHANGELOG.md yet: create it the first time something notable changes, with the header\
>   below. Don't backfill old history.\
> \- If the project checks its changelog, run that check (rule: project-tooling).
>
> Defaults (where the project already has a convention, follow it):
>
> \- Version format and scheme: release headings are \`\[\<version\>\] - YYYY-MM-DD\` with the\
>   version written the project's way. The header's versioning sentence names the scheme the\
>   project follows (Semantic Versioning, CalVer, …); leave it out when it follows none or\
>   never releases.\
> \- Releasing: in the same commit as the version bump, rename \`\[Unreleased\]\` to the release\
>   heading and start a new empty \`\[Unreleased\]\`.\
> \- Compare links: once releases are tagged on a host with a compare view, end the file with\
>   \`\[Unreleased\]: \<repo\>/compare/\<latest tag\>...HEAD\` and one\
>   \`\[\<version\>\]: \<repo\>/compare/\<previous tag\>...\<tag\>\` per release (the first links to its\
>   tag); a release adds its link and moves the Unreleased base. Tag names come from the\
>   project's existing tags or release docs; with none yet, \`v\<version\>\`, or\
>   \`\<name\>-v\<version\>\` in a repo with several versioned things.\
> \- The marker for "nothing notable" (a commit trailer, a PR label, …).
>
> \`\`\`markdown\
> \# Changelog
>
> All notable changes to this project are documented in this file.
>
> The format is based on \[Keep a Changelog\](https://keepachangelog.com/en/2.0.0/),\
> and this project adheres to \[Semantic Versioning\](https://semver.org/spec/v2.0.0.html).
>
> \#\# \[Unreleased\]\
> \`\`\`

### `project-tooling`

**In the rules list**, in every session's system prompt while the workflow plugin is on:

> [!NOTE]
> \- project-tooling (): Use the project's own tools and commands (dev shell, scripts, lockfiles, task runner, CI steps) instead of globally installed tools or ad-hoc commands; how to write AGENTS.md

**When the agent reads `rule://project-tooling`**, when its work matches the description. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Project tooling
>
> \- First read how the project builds and checks itself: AGENTS.md, README, package scripts,\
>   Makefile or justfile, dev shell or tool-version files, CI workflows.\
> \- Run checks the way CI runs them, with the versions the lockfiles pin.\
> \- A missing tool goes into the project's own setup (dev shell, dev dependency, pinned tool\
>   list), not onto this machine globally.\
> \- Don't make the project depend on one machine: no absolute personal paths, no personal\
>   config, no tools only you have installed.
>
> \#\# AGENTS.md
>
> \- Treat AGENTS.md as a README for agents: instructions, not a design spec. Nested folders may\
>   keep their own.\
> \- Use these sections, omitting empty ones: a one- or two-sentence summary, \`\#\# Layout\`,\
>   \`\#\# Commands\` (a code block), \`\#\# Workflow\`, \`\#\# Conventions\`, \`\#\# Code Review Rules\`,\
>   \`\#\# More detail\`.\
> \- One instruction per bullet, at most two lines, wrapped at 100 columns; numbers, not\
>   explanations. Keep the root file around 60 lines, nested ones around 30.\
> \- Move detail into \`docs/\`, one short file per topic, and link it from \`\#\# More detail\`.\
> \- \`\#\# Code Review Rules\`: 2–5 concise rules whose violation matters, each with a \`Safe path:\`.\
>   Leave mechanical checks to CI and linters.\
> \- Describe what the project protects, who acts, where data crosses a boundary and what is out\
>   of scope in \`docs/threat-model.md\`.

### `proportion-review`

**When:** always, in every session's system prompt while the workflow plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# What to report
>
> Report a finding when acting on it is worth more than it costs. Judge each\
> candidate by:\
> \- Likelihood: how plausibly the problem occurs for the people and systems that\
>   actually use this code, given how they use it.\
> \- Impact: what happens when it occurs, and how hard it is to notice and undo.\
> \- Cost of the fix: the code, complexity and upkeep it would add.
>
> Report what is likely, or serious when it happens. Leave out problems that\
> need circumstances nobody brings about in practice, unless the impact would be\
> serious, and wording that is imprecise only in such circumstances. A scope,\
> threat model or non-goal the project states wins over this.
>
> Report a shared cause once, not each symptom. For each finding, say how it\
> arises in practice, who it affects, and what it costs, so the author can weigh\
> it.

### `proportion`

**When:** always, in every session's system prompt while the workflow plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Proportion
>
> Before acting on any possible problem (one you foresee while building, a\
> review finding, a failing check, a gap in a doc), weigh:\
> \- Likelihood: how plausibly it occurs for the people and systems that actually\
>   use this work, given how they use it.\
> \- Impact: what happens when it occurs, and how hard it is to notice and undo.\
> \- Cost: the code, complexity and upkeep that handling it adds.
>
> Match the response:\
> \- Likely, or serious when it happens: handle it properly.\
> \- Unlikely and minor: leave it, and say so in one line where reviewers see it.\
>   A review finding like this gets a one-line reply with the reason, no code.\
> \- Unlikely but serious: add a cheap guard; ask the user before an expensive one.
>
> Docs and comments describe what holds for the cases that matter. Avoid\
> absolutes; when a claim says more than the work does, narrow the claim.
>
> Work is done when every known remaining issue is unlikely and minor, not when\
> nothing more can be found.
>
> When the user has to weigh a tradeoff, say what could go wrong, for whom, how\
> likely, and what each option gives and takes away, in plain words.

### `recurring-corrections`

**When:** always, in every session's system prompt while the workflow plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Recurring corrections
>
> For every correction, whatever its source:
>
> \1. Weigh it first (rule: proportion). One outside the written scope, or unlikely and minor,\
>    gets a one-line reply with the reason instead of a fix.\
> \2. Name the class: which general mistake is this one example of? (skill: failure-classes)\
> \3. Look for the other members of that class in the same work, and fix together the ones that\
>    pass the same weighing.\
> \4. Test the class: use a conformance suite, property-based tests, fixtures covering each\
>    member, or fault injection. A test for only the reported example isn't enough.\
> \5. Say what you did: the class, the members found, and the test.
>
> Stop and redesign when:\
> \- the same area is corrected a second time, or\
> \- a fix causes a new correction, or\
> \- two corrections share a cause.\
> Write the cause in a few lines and propose a different design or a narrower scope. The main\
> agent asks the user before continuing; a subagent stops and reports it to the agent that\
> started it.

### `think-before-building`

**When:** always, in every session's system prompt while the workflow plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):

> [!NOTE]
> \# Think before building
>
> Scale this to the change: two lines for a small fix, a page for a new protocol or data path.
>
> \1. Authority: is this already defined or solved? A standard, spec, schema, library, tool,\
>    or existing code in this repo. Use it, and hand-write only the gaps.\
> \2. Property: what must be true when it's done, stated about what users or consumers\
>    actually see, not about a stand-in that's easier to check.\
> \3. Scope: what it must handle (inputs, environments, who acts on it, including hostile\
>    actors if relevant) and what it deliberately won't, weighed by likelihood, impact and\
>    cost (rule: proportion). Write the non-goals down where reviewers will see them.\
> \4. Failure modes: for each step, decide the outcome if it fails halfway, runs twice, runs\
>    at the same time as itself, gets unexpected input, or times out (skill: failure-classes).
>
> Then check the property directly, and test the failure modes you decided on.
