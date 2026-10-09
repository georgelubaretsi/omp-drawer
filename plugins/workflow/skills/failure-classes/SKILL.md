---
name: failure-classes
description: General failure classes to check a design or change against - inputs, identity, state and time, partial failure, concurrency, resources, trust, compatibility, environment, configuration. Use when designing, before asking for review, and when handling any correction.
---
# Failure classes

Pick the classes the change touches, read their files, and decide an outcome for each member.
A member that doesn't apply needs no work; one that applies needs a decided outcome and a test.

The members are questions; the outcomes these files suggest are defaults. Where the project
declares its own policy (compatibility, retries, timeouts, limits, error handling), decide
the outcome that policy gives, and test that.

| Class | Ask | File |
|---|---|---|
| Inputs | empty, huge, malformed, unexpected encoding or binary, special characters, limits | [inputs.md](inputs.md) |
| Identity | duplicates, case, renames, collisions, reserved names, reused IDs | [identity.md](identity.md) |
| State and time | which version or state is read, stale caches, ordering, clocks | [state-and-time.md](state-and-time.md) |
| Partial failure | stopped halfway, retried, timed out, leftovers, rollback | [partial-failure.md](partial-failure.md) |
| Concurrency | two actors on one resource, races, ownership, exactly-once claims | [concurrency.md](concurrency.md) |
| Resources | timeouts, memory, rate limits, quotas, disk, time budgets | [resources.md](resources.md) |
| Trust | who controls each input, secrets, injection, permissions, threat model | [trust.md](trust.md) |
| Compatibility | versions, formats, other consumers, migrations, schemas they enforce | [compatibility.md](compatibility.md) |
| Environment | OS, shell, PATH, locale, filesystem, network, local vs CI | [environment.md](environment.md) |
| Configuration | defaults, missing values, precedence, environment variables | [configuration.md](configuration.md) |
