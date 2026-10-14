# Partial failure

Any operation can stop between two of its steps.

- Stopped after step N: what's left behind, and who notices and cleans it up?
- Retried: does a second run double the effect? (idempotency keys, dedupe, compare-and-set)
- Timed out: did it happen or not? Report it the way the project's error contract says; if it
  says nothing, report "unknown" when completion can't be established. Retry as the project's
  retry policy says; if it says nothing, only when a second run is harmless.
- Leftovers from an earlier crash: are they detected, expired, and kept from running later?
- Rollback: can a half-finished change be undone or completed?

Test: inject a failure after each step (kill, exception, timeout) and check the outcome you decided.
