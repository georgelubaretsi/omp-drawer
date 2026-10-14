# Trust

Who controls each input, and what they could make the code do.

- Threat model first: guarding against accidents, or against someone trying to get around the
  check? Write it down, so fixes target the right one and out-of-scope findings can be declined.
- Untrusted input: anything from users, files, the network, or other agents and tools.
- Injection: shell, SQL, path traversal, templates, prompts.
- Secrets: never logged, committed or passed as command-line arguments; know where they live.
- Permissions: least privilege; what could a compromised component reach?
- Enforcement point: a local check the user can skip is a warning, not a boundary.

Test: hostile fixtures for each input (traversal paths, shell metacharacters, oversized values)
and a secret scanner.
