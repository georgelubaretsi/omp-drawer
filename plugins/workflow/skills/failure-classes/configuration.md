# Configuration

Settings that change behavior without changing code.

- Optional settings: a documented default that is safe when nothing is set.
- Required settings that are missing, and supplied values that are invalid: a clear error,
  not a silent fallback.
- Precedence: flags, environment variables, files, defaults; documented and tested.
- Secrets in configuration: kept out of version control.

Test: run with no configuration (defaults apply, missing required settings fail), with invalid
values, and with each override level.
