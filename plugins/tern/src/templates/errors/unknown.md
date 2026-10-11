---
# Why the outcome is unknown.
causes:
  cancelled: cancelled after a Tern window took the request
  stopped: "the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed)"
  timedOut: "no answer within {{seconds}} s"
---
Outcome unknown: {{cause}}. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again.{{#if reloaded}} Tern's plugins were reloaded, so the next call can run (`state` was reset).{{#if appNap}} App Nap is on for Tern, which can throttle a background Tern past its 50 ms plugin budget: ask the user to run `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern.{{/if}}{{/if}}
