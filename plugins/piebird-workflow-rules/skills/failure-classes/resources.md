# Resources

Everything finite: time, memory, size, calls, disk.

- Time: an operation meant to finish gets a timeout, and the caller sees a clear result when
  it fires. A wait meant to last (an event loop, a watcher, a queue consumer, waiting for
  input) needs a way to cancel or shut it down instead.
- Memory and size: a decided limit for what's held at once; stream or paginate when the data
  can outgrow it.
- Rate limits and quotas: backoff, and what partial results mean.
- Disk: free space, temporary files cleaned up on every exit path.
- Budgets a host imposes: per-call time limits, sandboxes, sizes it accepts.

Test: shrink each limit (tiny timeout, small quota, full disk) and check the behavior.
