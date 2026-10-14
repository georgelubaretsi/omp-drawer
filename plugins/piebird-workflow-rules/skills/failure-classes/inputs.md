# Inputs

Data arriving from outside the code: files, requests, arguments, environment, other programs' output.

- Empty, missing, or only whitespace.
- Very large: what's the limit, and what happens beyond it? Stream when inputs can exceed memory.
- Malformed: wrong type, truncated, extra or missing fields, invalid structure.
- Encodings: bytes that aren't valid UTF-8, binary data, byte-order marks, CRLF line endings, NUL bytes.
- Special characters: quotes, separators and newlines inside values, leading dashes, path
  separators, glob and regex metacharacters.
- Numbers: zero, negative, overflow, floating-point precision, units.

Test: a fixture per member, or generated inputs (property-based testing). Parse formats with a
real parser for that format, not string splitting.
