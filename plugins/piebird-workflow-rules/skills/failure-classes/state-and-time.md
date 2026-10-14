# State and time

What the code reads, and when.

- Which version: the code reads a different version of the data than the one the property is
  about (a draft vs the saved copy, a cache vs the source, a local copy vs the remote, a change
  vs the whole result).
- Staleness: caches, memoized values and copies that outlive their source.
- The rules change: when a check's rules or config change, is existing data checked again?
- Ordering: events that arrive out of order, late, or twice.
- Clocks: time zones, daylight saving, skew between machines, monotonic vs wall-clock time,
  second and day boundaries.

Test: build the exact state the property is about and check that; add fixtures with reordered,
late and repeated events.
