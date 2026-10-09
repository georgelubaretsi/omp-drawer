---
description: When anything says the work is wrong (a reviewer, a test, CI, a linter, the user), fix the class of mistake, not the one example, and stop to redesign when corrections repeat
alwaysApply: true
---
# Recurring corrections

For every correction, whatever its source:

1. Weigh it first (rule: proportion). One outside the written scope, or unlikely and minor,
   gets a one-line reply with the reason instead of a fix.
2. Name the class: which general mistake is this one example of? (skill: failure-classes)
3. Look for the other members of that class in the same work, and fix together the ones that
   pass the same weighing.
4. Test the class: use a conformance suite, property-based tests, fixtures covering each
   member, or fault injection. A test for only the reported example isn't enough.
5. Say what you did: the class, the members found, and the test.

Stop and redesign when:
- the same area is corrected a second time, or
- a fix causes a new correction, or
- two corrections share a cause.
Write the cause in a few lines and propose a different design or a narrower scope. The main
agent asks the user before continuing; a subagent stops and reports it to the agent that
started it.
