---
description: For reviewers, report a finding only when acting on it is worth more than it costs
agents: reviewer
alwaysApply: true
---
# What to report

Report a finding when acting on it is worth more than it costs. Judge each
candidate by:
- Likelihood: how plausibly the problem occurs for the people and systems that
  actually use this code, given how they use it.
- Impact: what happens when it occurs, and how hard it is to notice and undo.
- Cost of the fix: the code, complexity and upkeep it would add.

Report what is likely, or serious when it happens. Leave out problems that
need circumstances nobody brings about in practice, unless the impact would be
serious, and wording that is imprecise only in such circumstances. A scope,
threat model or non-goal the project states wins over this.

Report a shared cause once, not each symptom. For each finding, say how it
arises in practice, who it affects, and what it costs, so the author can weigh
it.
