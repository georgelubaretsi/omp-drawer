# Concurrency

Two or more actors on one resource: threads, processes, windows, users, machines.

- Races: check-then-act with a gap between the check and the act.
- Claims and locks: is the operation that picks the winner exclusive on every platform you
  support? Verify it; don't assume.
- Delivery: does the design need at-most-once, at-least-once, or exactly-once in effect?
- Ownership: which actor may act on a shared item, and what if two believe they own it?
- Lifecycle: an actor disappears while holding something; how is that noticed and released?

Test: run the actors concurrently in a loop (hundreds of iterations) and check the invariant
every time; one passing run proves little.
