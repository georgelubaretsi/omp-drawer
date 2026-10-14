// Where a demo records: its Sandbox, the parts every place shares, and the helpers scenarios call.
// Two places make one (record.ts picks): the demo machine (place-machine.ts), a throwaway macOS
// virtual machine where omp, its plugins and Tern are set up as a person sets them up; and this
// Mac (place-host.ts), for the demos that need Claude Code and Codex signed in, where everything
// stays in a throwaway folder beside your own omp and Tern.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { CLAUDE_MODEL, CODEX_MODEL, codexHome } from "./harness";

/** The model demos run on: cheap and quick. */
export const DEMO_MODEL = "anthropic/claude-haiku-5-5:low";

/** A credential a demo needs besides omp's models; how each place gets it is its own. */
export type Credential = "kagi";

const MACOS_TERN = "/Applications/Tern.app/Contents/MacOS/tern";

export function ternBinary(): string {
	const found = process.env.TERN_BIN ?? Bun.which("tern") ?? (existsSync(MACOS_TERN) ? MACOS_TERN : undefined);
	if (!found) throw new Error("the tern command was not found (set TERN_BIN)");
	return found;
}

export interface Sandbox {
	/** The recording's own folder: Tern's control socket, its shots. */
	root: string;
	/** omp's HOME in demo panes. */
	home: string;
	/** Tern's config folder, where its settings.json is. */
	tern: string;
	/** The project the demo works in: the first tab opens here. */
	project: string;
	controlSocket: string;
	/** What Tern and `tern` commands get on top of the recorder's environment. */
	ternEnv: Record<string, string>;
	/**
	 * How the window gets past Tern's sign-in (its closed beta): "signed-in" needs Tern signed in;
	 * "hidden" hides the sheet with Tern's `account signed-in` script command, which signs nothing in.
	 */
	gate: "signed-in" | "hidden";
	/** The environment of a demo pane, for running omp in `setup`. */
	env: Record<string, string | undefined>;
	/** The checkout's plugins/ folder. */
	market: string;
	/** Installs one of the checkout's plugins in omp, as this place installs them. */
	installPlugin: (name: string) => Promise<void>;
	/** Undoes the sandbox; `keep` leaves its folder for a look. */
	close: (keep: boolean) => Promise<void>;
}

export interface SandboxOptions {
	/** The plugins to install in omp, by folder under plugins/plugins/. */
	plugins: string[];
	/** The checkout's plugins/ folder. */
	market: string;
	/** Credentials the demo needs besides omp's models. */
	credentials?: Credential[];
	/** The credentials' values, where the place is given them (the demo machine). */
	secrets?: Partial<Record<Credential, string>>;
	/** Tern settings for the demo window, over the defaults below. */
	ternSettings?: Record<string, unknown>;
	/** The project folder's name, as its tab shows it. */
	projectName?: string;
	/** Agents besides omp the demo runs, with the plugins (harness.ts). */
	agents?: ("claude" | "codex")[];
}

/** Runs a command; its output. Throws with what it said when it fails. */
export async function run(
	argv: string[],
	env: Record<string, string | undefined>,
	options: { cwd?: string; stdin?: string } = {},
): Promise<string> {
	const proc = Bun.spawn(argv, {
		env,
		cwd: options.cwd,
		stdout: "pipe",
		stderr: "pipe",
		stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(`${argv.join(" ")} exited ${code}: ${err.trim() || out.trim()}`);
	return out;
}

/**
 * omp's settings (the demo model in every role, omp's dark theme, no first-run setup) and the
 * shell's: `rc` and `env` add lines to .zshrc and .zshenv.
 */
export async function writeOmpHome(home: string, shell: { rc: string[]; env: string[] }): Promise<void> {
	const agent = join(home, ".omp", "agent");
	await mkdir(agent, { recursive: true });
	const roles = ["default", "smol", "tiny", "task", "slow", "plan"].map(role => `  ${role}: ${DEMO_MODEL}`);
	const config = ["theme:", "  dark: dark-arctic", "  light: light", "setupVersion: 2", "modelRoles:", ...roles];
	await writeFile(join(agent, "config.yml"), `${config.join("\n")}\n`);
	const version = (await run(["omp", "--version"], process.env)).trim().replace(/^omp\//, "");
	await writeFile(join(agent, "last-changelog-version"), version);
	// A short prompt with only the folder's name; omp starts on the demo model.
	const rc = [`PROMPT='%F{cyan}%1~%f ❯ '`, `alias omp='omp --model ${DEMO_MODEL}'`, ...shell.rc];
	await writeFile(join(home, ".zshrc"), `${rc.join("\n")}\n`);
	// `tern` on PATH, as Tern's users have it. Here, not in the shell wrapper: a system zshenv
	// (nix-darwin's) may set PATH afresh in every shell.
	const env = [`export PATH='${dirname(ternBinary())}':"$PATH"`, ...shell.env];
	await writeFile(join(home, ".zshenv"), `${env.join("\n")}\n`);
}

/**
 * Tern's settings for the demo window: dark, tabs on top, no update check, the demo's own over
 * them. An update check would put its toast in the video, and without an account (the demo
 * machine) its failure brings the sign-in sheet back.
 */
export async function writeTernSettings(dir: string, own: Record<string, unknown> = {}): Promise<void> {
	const settings = {
		theme: "Dark",
		tabs: "Horizontal",
		font_size: 13,
		reduce_motion: "on",
		auto_update: false,
		...own,
	};
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
}

/** Runs omp on the demo model in the sandbox's project, as a demo pane would: its output. */
export function omp(s: Sandbox, ...args: string[]): Promise<string> {
	return run(["omp", "--model", DEMO_MODEL, ...args], s.env, { cwd: s.project });
}

/**
 * Runs Claude Code on its demo model in the project, under your own login, as its demo panes do:
 * its output. Its transcript goes with the sandbox (harness.ts).
 */
export function claude(s: Sandbox, ...args: string[]): Promise<string> {
	return run(["claude", "--model", CLAUDE_MODEL, ...args], { ...s.env, HOME: homedir() }, { cwd: s.project });
}

/** Runs Codex on its demo model in the project, with the sandbox's Codex home: its output. */
export function codex(s: Sandbox, ...args: string[]): Promise<string> {
	return run(["codex", "-m", CODEX_MODEL, ...args], { ...s.env, CODEX_HOME: codexHome(s) }, { cwd: s.project });
}
