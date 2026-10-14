# Environment

Where the code runs.

- Operating system and CPU architecture.
- Shell and tools: POSIX `sh` vs bash, BSD vs GNU flags, PATH lookup, missing binaries.
- Locale and encoding settings.
- Filesystems: case sensitivity, which operations are atomic, symlinks, permissions.
- Network: offline, proxies, slow or flaky links.
- Context: local machine vs CI vs container vs a remote host.

Test: run in each environment you claim to support, or at least with a minimal PATH and a
different locale.
