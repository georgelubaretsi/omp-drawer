# Compatibility

Other programs and people that depend on what this produces or accepts.

- Other consumers: who reads this output, and which format do they enforce? Validate against
  their published schema or tool instead of a hand-written copy of its rules.
- Versions: older and newer readers and writers; required vs optional fields.
- Contracts: renamed or removed names, changed defaults, changed meaning.
- Migrations: data already stored in the old shape. What does the project promise for it:
  still loads, migrates, or is rejected with a clear message?

Test: run the consumer's own schema or validator in the tests; keep fixtures in the old shape
and check they get the promised outcome.
