---
description: Before any non-trivial change (feature, fix, script, integration), find what already defines or solves it, state what must be true, and decide how it fails
alwaysApply: true
---
# Think before building

Scale this to the change: two lines for a small fix, a page for a new protocol or data path.

1. Authority: is this already defined or solved? A standard, spec, schema, library, tool,
   or existing code in this repo. Use it, and hand-write only the gaps.
2. Property: what must be true when it's done, stated about what users or consumers
   actually see, not about a stand-in that's easier to check.
3. Scope: what it must handle (inputs, environments, who acts on it, including hostile
   actors if relevant) and what it deliberately won't, weighed by likelihood, impact and
   cost (rule: proportion). Write the non-goals down where reviewers will see them.
4. Failure modes: for each step, decide the outcome if it fails halfway, runs twice, runs
   at the same time as itself, gets unexpected input, or times out (skill: failure-classes).

Then check the property directly, and test the failure modes you decided on.
