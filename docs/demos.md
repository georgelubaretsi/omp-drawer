# Demos

Every plugin has a demo: `demos/<plugin>/demo.mp4`, `demo.webp` (the same video at half size,
which its README plays inline) and `report.md`, what the agent did for each prompt. A script
records each one, so a demo is recorded again, not edited, when the plugin changes.

## Recording

    bun tools/demo/record.ts <plugin> [--no-video] [--keep]   # from the workspace: just demo <plugin>

It runs `demos/<plugin>/scenario.ts` in a throwaway sandbox and writes the files next to it.
`--no-video` writes only the report, for working on what the plugin tells the agent; `--keep`
leaves the sandbox folder (`/tmp/omp-demo-*`) for a look. It needs:

- macOS with Tern installed and signed in. A Tern window opens and takes focus while it runs;
  leave the keyboard alone.
- omp signed in to Anthropic. The sandbox's omp borrows that sign-in through
  `omp auth-broker serve`; nothing is copied. Demos run on Claude Haiku.
- `ffmpeg` with libx264 and libwebp (the dev shell has it).
- A tiling window manager would resize the window: set `DEMO_WINDOW_SETUP` to a shell command
  that floats it. It runs once the window is open, with `DEMO_WINDOW_PID` set to its process.
- `piebird-kagi-search`: `KAGI_SESSION_TOKEN` set to the token in your Kagi Session Link
  (kagi.com/settings/user_details); the panes inherit it, and nothing is saved in the sandbox.
- A plugin that works in Claude Code or Codex: those signed in too (below).

## The report

`report.md` lists each prompt the demo sent, the agent it went to, how long it took, and every
tool call the agent made, with the intent it gave and the error any call got (Codex gives no
intent, and marks no call failed: an output saying a command or script failed counts). The
recorder exits 1 when a call failed.

A demo runs on a small model on purpose: where it stumbles, a person's agent stumbles too, only
less often. A failed call, or calls the task didn't need (probing an API, a second try), mean
the plugin explains itself badly. Fix what the agent reads (the skill, the rule, the tool's
description or its error text), not the scenario's prompt, and record again until the report is
clean. The report is committed with the video, so a change that makes the agent stumble shows
in the pull request.

## The sandbox

`tools/demo/sandbox.ts` makes a folder with:

- an omp home with the scenario's plugins linked from this checkout, the demo model in every
  role and omp's dark theme;
- a Tern profile of its own (`TERN_CONFIG_DIR`, daemon and control sockets, logs), dark, with
  horizontal tabs;
- the project the first tab opens in, which the scenario's `setup` fills, usually with
  `demos/shop-api.ts`, a small made-up web shop (`tools/demo/project.ts` commits it as a demo
  author).

Your omp, its plugins and sessions, and your Tern windows stay as they are. Demos never use a
real project.

## Several agents

A plugin whose catalog hosts list several agents shows each of them doing the same task, a tab
each: omp and Claude Code on Claude Haiku 5.5, Codex on gpt-6.1-sol. The scenario lists them in
`agents` (`tools/demo/harness.ts` sets them up):

- Claude Code runs under your own login and config (its login is in your keychain), with
  `--plugin-dir`: the plugin loads for that session only, nothing is installed. The demo answers
  its question whether you trust the project folder; your `~/.claude.json` keeps that answer for
  the folder, which is gone afterwards. The transcript under `~/.claude/projects` is removed.
- Codex loads plugins only by installing them, so it gets a `CODEX_HOME` in the sandbox, with the
  plugin installed and its `auth.json` a link to yours: nothing is copied. Should Codex replace
  the link with a refreshed login, that file goes back to yours before the sandbox is removed.

## A scenario

`scenario.ts` exports a `Scenario` (`tools/demo/record.ts`): the plugins to link, the project's
name, `setup`, and `run`, which drives the window through `Demo` (`tools/demo/director.ts`):

| Call | Does |
|---|---|
| `caption(text, sub?)` | Shows a caption under the window until the next one |
| `startOmp(command?, ready?)` | Types `omp` (or `command`) and waits for its prompt (or for `ready`) |
| `newTab()`, `startAgent("claude" \| "codex")` | Opens a tab in the project; starts Claude Code or Codex there |
| `prompt(text, {fast?})` | Sends a prompt to the agent last started and waits for the answer (from its journal), shown `fast` times faster |
| `type(text)`, `key(chord, label?)` | Types into the focused pane; presses a key, shown as `label` |
| `waitFor(text)` | Waits until the window shows `text` |
| `speed(factor)` | Plays what follows faster, with a badge saying so |
| `ring(selector, label?)` | Circles an element of the window |
| `glide(from, to)`, `click(x, y)`, `hidePointer()` | Moves and clicks a drawn pointer |

`compose.ts` draws the frames into the video: 1080×1350 (4:5, what phones show best), the
window on top at twice its size and the captions below, in type large enough to read on a phone.

Keep a demo short, 20 to 45 seconds: one job, shown working, with captions that say what
happens and why it matters, and the install command at the end. Check the frames for anything
private before committing them.

## Desktop demos

The desktop installer's demos (`demos/installer-macos/`) happen in a throwaway macOS virtual
machine, so nothing touches your own apps or screen:

    bun tools/demo/vm/record.ts installer-macos [--keep]   # from the workspace: just demo-vm installer-macos

It needs [tart](https://tart.run) (`TART` names it when it isn't on `PATH`) with the scenario's
base image pulled (`tart pull ghcr.io/cirruslabs/macos-tahoe-vanilla:latest`), and Bun's
official build for it and for `bun tools/native.ts` before it: programs built by the dev shell's
Bun don't run on a clean Mac. It clones the image (copy-on-write), starts it without a window,
signs in over SSH with the image's own user, and watches and drives its screen over one VNC
connection (`tools/demo/vm/vnc.ts`; tart's VNC server stops the machine after a few). The
scenario's `setup` puts the apps and the installer there; `run` drives the screen through
`VmDemo` (`tools/demo/vm/director.ts`): `caption`, `click(x, y)` and `doubleClick` in the
screen's points, `settle()` (waits for the screen to change and hold still, played fast), and
`guest.shell(command)`. The machine is deleted afterwards; `--keep` leaves it stopped.

Places on the screen are fixed for the base image; record again, and check the places, after
changing the page or the image.
