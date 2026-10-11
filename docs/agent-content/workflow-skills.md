# workflow: what agents receive, skills

Each tinted box is exactly what the agent receives; everything else is a note. The plugin's rules are on [their own page](workflow.md).

**Contents:** [Rules](workflow.md) · [Skills](#skills) · [All plugins](index.md)

## Skills

### `failure-classes`

**In the skills list**, in every session's system prompt while the workflow plugin is on (omp may shorten the description):

> [!NOTE]
> \- failure-classes: General failure classes to check a design or change against - inputs, identity, state and time, partial failure, concurrency, resources, trust, compatibility, environment, configuration. Use when designing, before asking for review, and when handling any correction.

**When the agent reads `skill://failure-classes`**, which omp tells it to do first when the description matches the task. The whole file, as the agent gets it:

> [!NOTE]
> \---\
> name: failure-classes\
> description: General failure classes to check a design or change against - inputs, identity, state and time, partial failure, concurrency, resources, trust, compatibility, environment, configuration. Use when designing, before asking for review, and when handling any correction.\
> \---\
> \# Failure classes
>
> Pick the classes the change touches, read their files, and decide an outcome for each member.\
> A member that doesn't apply needs no work; one that applies needs a decided outcome and a test.
>
> The members are questions; the outcomes these files suggest are defaults. Where the project\
> declares its own policy (compatibility, retries, timeouts, limits, error handling), decide\
> the outcome that policy gives, and test that.
>
> \| Class \| Ask \| File \|\
> \|---\|---\|---\|\
> \| Inputs \| empty, huge, malformed, unexpected encoding or binary, special characters, limits \| \[inputs.md\](inputs.md) \|\
> \| Identity \| duplicates, case, renames, collisions, reserved names, reused IDs \| \[identity.md\](identity.md) \|\
> \| State and time \| which version or state is read, stale caches, ordering, clocks \| \[state-and-time.md\](state-and-time.md) \|\
> \| Partial failure \| stopped halfway, retried, timed out, leftovers, rollback \| \[partial-failure.md\](partial-failure.md) \|\
> \| Concurrency \| two actors on one resource, races, ownership, exactly-once claims \| \[concurrency.md\](concurrency.md) \|\
> \| Resources \| timeouts, memory, rate limits, quotas, disk, time budgets \| \[resources.md\](resources.md) \|\
> \| Trust \| who controls each input, secrets, injection, permissions, threat model \| \[trust.md\](trust.md) \|\
> \| Compatibility \| versions, formats, other consumers, migrations, schemas they enforce \| \[compatibility.md\](compatibility.md) \|\
> \| Environment \| OS, shell, PATH, locale, filesystem, network, local vs CI \| \[environment.md\](environment.md) \|\
> \| Configuration \| defaults, missing values, precedence, environment variables \| \[configuration.md\](configuration.md) \|

**When the agent reads `skill://failure-classes/compatibility.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Compatibility
>
> Other programs and people that depend on what this produces or accepts.
>
> \- Other consumers: who reads this output, and which format do they enforce? Validate against\
>   their published schema or tool instead of a hand-written copy of its rules.\
> \- Versions: older and newer readers and writers; required vs optional fields.\
> \- Contracts: renamed or removed names, changed defaults, changed meaning.\
> \- Migrations: data already stored in the old shape. What does the project promise for it:\
>   still loads, migrates, or is rejected with a clear message?
>
> Test: run the consumer's own schema or validator in the tests; keep fixtures in the old shape\
> and check they get the promised outcome.

**When the agent reads `skill://failure-classes/concurrency.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Concurrency
>
> Two or more actors on one resource: threads, processes, windows, users, machines.
>
> \- Races: check-then-act with a gap between the check and the act.\
> \- Claims and locks: is the operation that picks the winner exclusive on every platform you\
>   support? Verify it; don't assume.\
> \- Delivery: does the design need at-most-once, at-least-once, or exactly-once in effect?\
> \- Ownership: which actor may act on a shared item, and what if two believe they own it?\
> \- Lifecycle: an actor disappears while holding something; how is that noticed and released?
>
> Test: run the actors concurrently in a loop (hundreds of iterations) and check the invariant\
> every time; one passing run proves little.

**When the agent reads `skill://failure-classes/configuration.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Configuration
>
> Settings that change behavior without changing code.
>
> \- Optional settings: a documented default that is safe when nothing is set.\
> \- Required settings that are missing, and supplied values that are invalid: a clear error,\
>   not a silent fallback.\
> \- Precedence: flags, environment variables, files, defaults; documented and tested.\
> \- Secrets in configuration: kept out of version control.
>
> Test: run with no configuration (defaults apply, missing required settings fail), with invalid\
> values, and with each override level.

**When the agent reads `skill://failure-classes/environment.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Environment
>
> Where the code runs.
>
> \- Operating system and CPU architecture.\
> \- Shell and tools: POSIX \`sh\` vs bash, BSD vs GNU flags, PATH lookup, missing binaries.\
> \- Locale and encoding settings.\
> \- Filesystems: case sensitivity, which operations are atomic, symlinks, permissions.\
> \- Network: offline, proxies, slow or flaky links.\
> \- Context: local machine vs CI vs container vs a remote host.
>
> Test: run in each environment you claim to support, or at least with a minimal PATH and a\
> different locale.

**When the agent reads `skill://failure-classes/identity.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Identity
>
> How things are named, matched and told apart.
>
> \- Duplicates: two items with the same name or key; which one wins?\
> \- Case and normalization: \`Foo\` vs \`foo\`, Unicode normal forms, trailing whitespace,\
>   case-insensitive filesystems.\
> \- Renames and moves: does the old name still resolve, and do references follow?\
> \- Collisions: generated names or IDs clashing across runs, processes or machines.\
> \- Reserved names: names or prefixes another system refuses.\
> \- Reuse: an ID freed and handed out again while something still refers to the old owner.
>
> Test: fixtures with duplicates, case variants, renamed items and reserved names.

**When the agent reads `skill://failure-classes/inputs.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Inputs
>
> Data arriving from outside the code: files, requests, arguments, environment, other programs' output.
>
> \- Empty, missing, or only whitespace.\
> \- Very large: what's the limit, and what happens beyond it? Stream when inputs can exceed memory.\
> \- Malformed: wrong type, truncated, extra or missing fields, invalid structure.\
> \- Encodings: bytes that aren't valid UTF-8, binary data, byte-order marks, CRLF line endings, NUL bytes.\
> \- Special characters: quotes, separators and newlines inside values, leading dashes, path\
>   separators, glob and regex metacharacters.\
> \- Numbers: zero, negative, overflow, floating-point precision, units.
>
> Test: a fixture per member, or generated inputs (property-based testing). Parse formats with a\
> real parser for that format, not string splitting.

**When the agent reads `skill://failure-classes/partial-failure.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Partial failure
>
> Any operation can stop between two of its steps.
>
> \- Stopped after step N: what's left behind, and who notices and cleans it up?\
> \- Retried: does a second run double the effect? (idempotency keys, dedupe, compare-and-set)\
> \- Timed out: did it happen or not? Report it the way the project's error contract says; if it\
>   says nothing, report "unknown" when completion can't be established. Retry as the project's\
>   retry policy says; if it says nothing, only when a second run is harmless.\
> \- Leftovers from an earlier crash: are they detected, expired, and kept from running later?\
> \- Rollback: can a half-finished change be undone or completed?
>
> Test: inject a failure after each step (kill, exception, timeout) and check the outcome you decided.

**When the agent reads `skill://failure-classes/resources.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Resources
>
> Everything finite: time, memory, size, calls, disk.
>
> \- Time: an operation meant to finish gets a timeout, and the caller sees a clear result when\
>   it fires. A wait meant to last (an event loop, a watcher, a queue consumer, waiting for\
>   input) needs a way to cancel or shut it down instead.\
> \- Memory and size: a decided limit for what's held at once; stream or paginate when the data\
>   can outgrow it.\
> \- Rate limits and quotas: backoff, and what partial results mean.\
> \- Disk: free space, temporary files cleaned up on every exit path.\
> \- Budgets a host imposes: per-call time limits, sandboxes, sizes it accepts.
>
> Test: shrink each limit (tiny timeout, small quota, full disk) and check the behavior.

**When the agent reads `skill://failure-classes/state-and-time.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# State and time
>
> What the code reads, and when.
>
> \- Which version: the code reads a different version of the data than the one the property is\
>   about (a draft vs the saved copy, a cache vs the source, a local copy vs the remote, a change\
>   vs the whole result).\
> \- Staleness: caches, memoized values and copies that outlive their source.\
> \- The rules change: when a check's rules or config change, is existing data checked again?\
> \- Ordering: events that arrive out of order, late, or twice.\
> \- Clocks: time zones, daylight saving, skew between machines, monotonic vs wall-clock time,\
>   second and day boundaries.
>
> Test: build the exact state the property is about and check that; add fixtures with reordered,\
> late and repeated events.

**When the agent reads `skill://failure-classes/trust.md`**, where the skill points it. The whole file:

> [!NOTE]
> \# Trust
>
> Who controls each input, and what they could make the code do.
>
> \- Threat model first: guarding against accidents, or against someone trying to get around the\
>   check? Write it down, so fixes target the right one and out-of-scope findings can be declined.\
> \- Untrusted input: anything from users, files, the network, or other agents and tools.\
> \- Injection: shell, SQL, path traversal, templates, prompts.\
> \- Secrets: never logged, committed or passed as command-line arguments; know where they live.\
> \- Permissions: least privilege; what could a compromised component reach?\
> \- Enforcement point: a local check the user can skip is a warning, not a boundary.
>
> Test: hostile fixtures for each input (traversal paths, shell metacharacters, oversized values)\
> and a secret scanner.
