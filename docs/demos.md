# Demos

Every plugin has a demo, `demos/<plugin>/`, and its features have short ones of their own,
`demos/<plugin>/<feature>/`: `demo.mp4`, `demo.webp` (the same video at half size, which a README
plays inline) and `report.md`, what the agent did for each prompt. A script records each one, so a
demo is recorded again, not edited, when the plugin changes.

## Recording

    just demo <demo>... [--jobs 2] [--no-video] [--keep]   # in the demo machine: bun tools/demo/vm/run.ts
    just demo-host <demo> [--no-video] [--keep]            # on this Mac: bun tools/demo/record.ts

`<demo>` is `<plugin>` or `<plugin>/<feature>`. The recorder (`tools/demo/record.ts`) runs
`demos/<demo>/scenario.ts` and writes the files next to it. `--no-video` writes only the report,
for working on what the plugin tells the agent; `--keep` leaves what the demo ran in for a look,
with any credential signed out first.
A run that failed or stumbled still writes its report. From the demo machine, `just demo` also
brings back omp's session journals (each call's arguments and result) and, for a failure,
`failure.png`, what the window last showed: beside the gateway's logs, in the folder it names.
Demos record in the demo machine; only those with Claude Code and Codex, which aren't signed in
there, record on this Mac.

## Recording in a virtual machine

`just demo` records each demo in its own throwaway clone of a macOS virtual machine, the demo
machine: nothing opens on this Mac's screen, and nothing the demo does stays. `--jobs 2` records
two at a time, as many macOS virtual machines as a Mac runs at once (yours included). It needs:

- The dev shell's tart and Packer, and the machine's image, built once with `just demo-image`
  (`tools/demo/vm/image.ts`, `machine.pkr.hcl`): macOS in dark mode with Tern, Nix, omp and the
  flake's `demo-machine` (Bun, ffmpeg, Git), Tern and omp copied from this Mac (omp from Nix).
  Build it again after updating either.
- omp signed in here: the machine's omp sends its model requests to this Mac's
  `omp auth-gateway serve`, on a loopback port lent to the machine through its SSH connection
  (`tools/demo/vm/lend.ts`). The machine signs in nowhere and never sees a token.
- For `piebird-kagi-search`, Kagi's session: `KAGI_SESSION_TOKEN`, or the kagi CLI signed in
  (`~/.config/kagi-cli/config.toml`).

Each clone gets this checkout's `plugins/` folder read-only, the marketplace the desktop installer
gives omp (its payload, `tools/installer.ts`: the built programs included, the repo's packages
left out, so a plugin that needs one it doesn't carry fails here as on a person's Mac), and a
folder of its own for the recording. The recorder runs there as the machine's own user and sets
omp and Tern up as a person does (`tools/demo/place-machine.ts`): it adds that marketplace and
installs the demo's plugins (`omp plugin install <plugin>@piebird`), writes omp's and Tern's
settings in their own folders, and signs a credential in with the plugin's own sign-in, the secret
on stdin (`tools/demo/credentials.ts`): Kagi with `native/kagi-vault sign-in --link`, kept in
the machine's Keychain. A Tern plugin comes as omp brings it, when omp starts in a Tern pane. What
differs from a person's Mac:

- omp's models: the demo model's provider goes to the lent gateway (`transport: pi-native` in
  `models.yml`), with a placeholder key, so omp counts it as a key's, not a subscription's: a
  scenario where that matters (piebird-agent-variants) says in its prompt that Claude is the
  user's subscription, as it is on this Mac. The gateway's own catalog stays out (`/v1/models`
  answers empty): it names every model this Mac's sign-ins reach, which omp would list under that
  provider, so the machine's omp lists the models it ships with, as a person's does.
- Tern isn't signed in (its closed beta needs a Stencil account): the window hides its sign-in
  sheet with `account signed-in`, Tern's script command for screenshots, which signs nothing in.
- The recorder works over SSH, whose login sessions macOS doesn't unlock the Keychain for: it
  unlocks it with the machine's own password first, as signing in at the screen does.

Claude Code works through the gateway, but Codex sends a custom provider no tools for the
gpt-6 models (it learns their tools only from ChatGPT's own model list), so the demos with both
record on this Mac.

## On this Mac

`just demo-host` records in a throwaway folder beside your own omp and Tern
(`tools/demo/place-host.ts`). It needs:

- macOS with Tern installed and signed in. A Tern window opens and takes focus while it runs;
  leave the keyboard alone.
- omp signed in to Anthropic. The sandbox's omp borrows that sign-in through
  `omp auth-broker serve`; nothing is copied. Demos run on Claude Haiku.
- `ffmpeg` with libx264 and libwebp (the dev shell has it).
- A tiling window manager would resize the window: set `DEMO_WINDOW_SETUP` to a shell command
  that floats it. It runs once the window is open, with `DEMO_WINDOW_PID` set to its process.
- `piebird-kagi-search`: `KAGI_SESSION_TOKEN`, or the kagi CLI signed in
  (`~/.config/kagi-cli/config.toml`). The demo's agents get it as `KAGI_SESSION_TOKEN`
  (`tools/demo/credentials.ts`), so nothing goes into this Mac's Keychain; Codex passes its
  plugins' programs none of its own variables, so its copy of the plugin sets it in its
  `mcp.json`, inside the throwaway folder.
- A plugin that works in Claude Code or Codex: those signed in too (below).

## The report

`report.md` lists each prompt the demo sent, the agent it went to, how long it took, and every
tool call the agent made, with the intent it gave and the error any call got (Codex gives no
intent, and marks no call failed: an output saying a command or script failed counts). A call
omp puts off because a background job just finished, for the agent to take its result first,
isn't a failure. The recorder exits 1 when a call failed.

A demo runs on a small model on purpose: where it stumbles, a person's agent stumbles too, only
less often. A failed call, or calls the task didn't need (probing an API, a second try), mean
the plugin explains itself badly. Fix what the agent reads (the skill, the rule, the tool's
description or its error text), not the scenario's prompt, and record again until the report is
clean. The report is committed, so a change that makes the agent stumble shows in the pull
request's diff. The video isn't (`.gitignore`): it goes into a comment on the pull request,
uploaded with `gh pr comment <pr> --attach`, where GitHub plays it.

## The sandbox

Either place (`tools/demo/sandbox.ts` has what they share) gives the scenario:

- an omp home with the scenario's plugins, the demo model in every role and omp's dark theme:
  the machine user's own, or a folder's with the plugins linked from this checkout;
- Tern's settings, dark, with horizontal tabs: in Tern's own folder, or a Tern profile of its own
  (`TERN_CONFIG_DIR`, daemon and control sockets, logs);
- the project the first tab opens in, which the scenario's `setup` fills, usually with
  `demos/shop-api.ts`, a small made-up web shop (`tools/demo/project.ts` commits it as a demo
  author).

On this Mac, your omp, its plugins and sessions, and your Tern windows stay as they are. Demos
never use a real project.

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

`scenario.ts` exports a `Scenario` (`tools/demo/record.ts`): the plugins to install, the
credentials and agents it needs, the project's name, `setup`, and `run`. Feature demos share their
title card, closing line and journal helpers (`demos/feature.ts`). `run` drives the window through
`Demo` (`tools/demo/director.ts`):

| Call | Does |
|---|---|
| `caption(text, sub?)` | Shows a caption under the window until the next one |
| `startOmp(command?, ready?)` | Types `omp` (or `command`) and waits for its prompt (or for `ready`) |
| `newTab()`, `startAgent("claude" \| "codex")` | Opens a tab in the project; starts Claude Code or Codex there |
| `prompt(text, {fast?, answer?})` | Sends a prompt to the agent last started and waits for the answer (from its journal), shown `fast` times faster. `answer` is the person answering a question the agent asks on the way: once the window shows `when`, it presses `keys`, again while the window shows `open` (an ask of several questions). A turn that never showed `when` fails the run, since the captions tell of the question, unless `optional` says the agent may ask in its reply instead |
| `type(text)`, `key(chord, label?)` | Types into the focused pane; presses a key, shown as `label` |
| `waitFor(text)` | Waits until the window shows `text` |
| `idle()` | Waits until omp has shown no "Working" for a few seconds: a turn it starts by itself, such as relaying a background job's result, is over |
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

    bun tools/demo/vm/record.ts installer-macos [--keep]   # from the workspace: just demo-desktop installer-macos

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

Places and colors on the screen are fixed for the base image, in dark mode (the scenario writes
the setting and restarts the login session); record again, and check them, after changing the
page or the image. `DEMO_SHOTS=<folder>` saves the screen at each of the scenario's `shot(name)`
and, when a run fails, `failure.png`; `waitForColor` says which color it found instead.
