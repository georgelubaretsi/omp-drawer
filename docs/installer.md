# The desktop installer

One program per platform for people who don't use a terminal: "Install piebird.app" in a disk
image on macOS, `piebird-<version>-windows-x64.exe` on Windows. It finds the apps and agents on
the computer, opens a page in the browser listing the plugins and where each goes, and installs
or removes them with one click. It quits about eight seconds after the page is closed.

Source: `installer/` (the program), `tools/installer.ts` (the build).

## What it finds

- Apps, by bundle id on macOS (Spotlight, then `/Applications` and `~/Applications`) and by
  Store package on Windows, never by process name: ChatGPT (`com.openai.codex`, the Codex app;
  ChatGPT Classic shares its name and runs no plugins) and Claude
  (`com.anthropic.claudefordesktop`).
- Commands: `omp`, `claude` (Claude Code) and `codex`, on `PATH` and in the folders their
  installers use (`~/.bun/bin`, `~/.local/bin`, Homebrew's, npm's), which a program opened from
  Finder doesn't have on its `PATH`. They run with those folders on `PATH`. When ChatGPT is
  installed on macOS, its own `codex` command (inside the app) is used for Codex.

## What it writes

| For                            | What                                                                                                                                                                                                                    | Where                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| everyone                       | The shared copy: the marketplace files and every plugin, with this platform's programs                                                                                                                                  | `~/.agents/piebird/marketplace/`                                                                                         |
| omp                            | That folder as the `piebird` marketplace, each plugin installed from it (upgraded when already there)                                                                                                                   | omp's own state, through `omp plugin`                                                                                    |
| Claude Code, Claude's Code tab | That folder as a directory marketplace, each Claude plugin installed; they load in place from it                                                                                                                        | `claude plugin` when a command is found, else `extraKnownMarketplaces` and `enabledPlugins` in `~/.claude/settings.json` |
| Claude chat                    | A `.mcpb` per plugin with a program, opened with Claude from the page; Claude's own window adds it                                                                                                                      | `~/.agents/piebird/mcpb/`                                                                                                |
| ChatGPT, Codex                 | Each Codex plugin copied with an `mcp.json` for its program, listed in the personal marketplace, then installed by `codex plugin add` (or, with no command, cached at its version and switched on as that command does) | `~/.codex/plugins/<plugin>/`, `~/.agents/plugins/marketplace.json`, `~/.codex/plugins/cache/`, `~/.codex/config.toml`    |

`CODEX_HOME` and `CLAUDE_CONFIG_DIR` are honoured as Codex and Claude Code honour them. The
people's own files (`settings.json`, `config.toml`, the personal marketplace) are edited, never
replaced: other entries, tables and comments stay; one that isn't JSON (or TOML) is reported
and left alone. Folders are written beside the old one and swapped in, so a failure halfway
leaves the old copy.

A `piebird` marketplace that omp or Claude Code already has from somewhere else (a checkout, the
repository) is left alone, installing and removing; the page says where it comes from.

Codex's hooks aren't set up: Codex reviews a plugin's hooks before they run, and an installer
that marked them reviewed would skip that.

## The page

Served on 127.0.0.1 behind a random path, as the settings and sign-in pages are
(`kit/program/local-page.ts`). It names only what the installer offered it (a plugin, the n-th
file to open, an app to restart), never a path or a command. After an install it offers:

- **Restart ChatGPT**, when ChatGPT is running: it loads plugins when it starts. Quitting it is
  the person's click.
- **Add … to Claude**, per `.mcpb`: Claude shows its own install window.
- **Sign in**, for a plugin with a vault (`native/<vault> sign-in`, which opens its own page).
- **Settings for the plugins**: the settings page (`kit/program/settings.ts`).

**Remove** uninstalls every piebird plugin this installer put in place and deletes its copies;
the person's piebird settings files and the vaults' sign-ins stay. Choices made in an app's own
plugin settings may go with the plugins: Claude Code's `plugin marketplace remove` deletes the
options it kept for them (kagi-search's search choice, threads' folder), and the page says so
before it removes anything. A Claude chat extension is removed in Claude's settings: Claude keeps
its own copy.

## Building

    bun tools/native.ts                              # the plugins' programs, every platform
    bun tools/installer.ts                           # this computer's platform, into dist/installer/
    bun tools/installer.ts --platform windows-x64    # or macos-arm64, macos-x64

macOS builds are made on a Mac. The app has no Dock icon (`LSUIElement`), and is signed with
Bun's JIT entitlement (`tools/bun.entitlements`): ad hoc, or with `PIEBIRD_CODESIGN_IDENTITY`.
`--release` refuses a Bun that isn't Bun's official build (the dev shell's links Nix's ICU) and
notarizes and staples the disk image (`APPLE_NOTARY_KEY`, `APPLE_NOTARY_KEY_ID`,
`APPLE_NOTARY_ISSUER`). The Windows program is cross-compiled without a console window and
signed when `WINDOWS_CERTIFICATE` is set; until then SmartScreen warns whoever runs it.

Run from source, for development:

    bun tools/installer.ts --payload /tmp/payload.bin    # the plugins it would carry
    HOME=$(mktemp -d) bun installer/main.ts --payload /tmp/payload.bin --no-browser

Only with a throwaway `HOME`: it installs into the omp, Claude Code and ChatGPT of whoever runs
it. Even then the page's buttons act on the real apps (Restart, Add to Claude) and the system's
secret store (Sign in).
