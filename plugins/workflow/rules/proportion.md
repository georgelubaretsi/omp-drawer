---
description: Weigh every possible problem by how likely it is in real use, how much it would hurt and what handling it costs; work is done when what's left is unlikely and minor
alwaysApply: true
---
# Proportion

Before acting on any possible problem (one you foresee while building, a
review finding, a failing check, a gap in a doc), weigh:
- Likelihood: how plausibly it occurs for the people and systems that actually
  use this work, given how they use it.
- Impact: what happens when it occurs, and how hard it is to notice and undo.
- Cost: the code, complexity and upkeep that handling it adds.

Match the response:
- Likely, or serious when it happens: handle it properly.
- Unlikely and minor: leave it, and say so in one line where reviewers see it.
  A review finding like this gets a one-line reply with the reason, no code.
- Unlikely but serious: add a cheap guard; ask the user before an expensive one.

Docs and comments describe what holds for the cases that matter. Avoid
absolutes; when a claim says more than the work does, narrow the claim.

Work is done when every known remaining issue is unlikely and minor, not when
nothing more can be found.

When the user has to weigh a tradeoff, say what could go wrong, for whom, how
likely, and what each option gives and takes away, in plain words.
