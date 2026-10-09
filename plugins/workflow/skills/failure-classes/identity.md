# Identity

How things are named, matched and told apart.

- Duplicates: two items with the same name or key; which one wins?
- Case and normalization: `Foo` vs `foo`, Unicode normal forms, trailing whitespace,
  case-insensitive filesystems.
- Renames and moves: does the old name still resolve, and do references follow?
- Collisions: generated names or IDs clashing across runs, processes or machines.
- Reserved names: names or prefixes another system refuses.
- Reuse: an ID freed and handed out again while something still refers to the old owner.

Test: fixtures with duplicates, case variants, renamed items and reserved names.
