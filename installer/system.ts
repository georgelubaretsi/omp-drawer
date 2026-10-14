// The computer the installer runs on: which agents it has, and opening, quitting and starting
// their apps. Apps are found by bundle id (macOS) or package name (Windows), never by process
// name: ChatGPT Classic shares ChatGPT's name, and Claude Code's command is also claude.exe.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export interface Ran {
	code: number;
	stdout: string;
	stderr: string;
}

/** What the installer asks of the computer, so tests can stand in for it. */
export interface Sys {
	readonly platform: NodeJS.Platform;
	readonly home: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	exists(path: string): boolean;
	/** Runs `cmd`, with `stdin` written to it; killed after `timeoutMs`, when given. */
	run(cmd: readonly string[], stdin?: string, timeoutMs?: number): Promise<Ran>;
}

/**
 * This computer. Commands run with the folders people's commands are in on PATH: a program opened
 * from Finder gets a short one, and omp is a script that starts bun by name.
 */
export function realSys(): Sys {
	const here = { platform: process.platform, home: homedir(), env: process.env };
	// Windows spells it Path; one entry, whatever its case.
	const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "PATH"));
	env.PATH = [...new Set(commandFolders(here))].join(delimiter);
	return {
		...here,
		exists: existsSync,
		async run(cmd, stdin, timeoutMs) {
			const child = Bun.spawn({
				cmd: [...cmd],
				env,
				stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
				stdout: "pipe",
				stderr: "pipe",
				windowsHide: true,
				...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
			});
			const [stdout, stderr] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);
			return { code: await child.exited, stdout, stderr };
		},
	};
}

export const APPS = {
	chatgpt: {
		bundle: "com.openai.codex",
		mac: "ChatGPT.app",
		windowsPackage: "OpenAI.Codex",
		windowsExe: "ChatGPT.exe",
	},
	claude: {
		bundle: "com.anthropic.claudefordesktop",
		mac: "Claude.app",
		windowsPackage: "Claude",
		windowsExe: "claude.exe",
	},
} as const;
export type AppName = keyof typeof APPS;

export interface Agents {
	/** Commands, by full path. */
	readonly omp?: string;
	readonly claude?: string;
	readonly codex?: string;
	/** Desktop apps: the .app on macOS, the program on Windows. */
	readonly apps: Partial<Record<AppName, string>>;
}

/** Where people's commands usually are, beyond PATH. */
function commandFolders(sys: Pick<Sys, "platform" | "home" | "env">): string[] {
	const h = sys.home;
	const path = (sys.env.PATH ?? sys.env.Path ?? "").split(delimiter).filter(Boolean);
	const known =
		sys.platform === "win32"
			? [
					join(h, ".bun", "bin"),
					join(h, ".local", "bin"),
					join(sys.env.APPDATA ?? join(h, "AppData", "Roaming"), "npm"),
				]
			: [
					join(h, ".bun/bin"),
					join(h, ".local/bin"),
					join(h, ".claude/local"),
					"/opt/homebrew/bin",
					"/usr/local/bin",
					join(h, ".npm-global/bin"),
				];
	return [...path, ...known];
}

export function findCommand(sys: Sys, name: string): string | undefined {
	const names = sys.platform === "win32" ? [`${name}.exe`, `${name}.cmd`] : [name];
	for (const folder of commandFolders(sys)) {
		for (const n of names) if (sys.exists(join(folder, n))) return join(folder, n);
	}
	return undefined;
}

async function macApp(sys: Sys, app: (typeof APPS)[AppName]): Promise<string | undefined> {
	const found = await sys.run(["/usr/bin/mdfind", `kMDItemCFBundleIdentifier == '${app.bundle}'`]);
	const candidates = [
		...found.stdout.split("\n").filter(Boolean),
		`/Applications/${app.mac}`,
		join(sys.home, "Applications", app.mac),
	];
	for (const path of candidates) {
		const id = await sys.run([
			"/usr/bin/plutil",
			"-extract",
			"CFBundleIdentifier",
			"raw",
			"-o",
			"-",
			join(path, "Contents/Info.plist"),
		]);
		if (id.code === 0 && id.stdout.trim() === app.bundle) return path;
	}
	return undefined;
}

/** An `app-<version>` folder's version numbers; a part that isn't one is NaN and skipped in order. */
function versionOf(name: string): number[] {
	return name.slice("app-".length).split(".").map(Number);
}

/** Newer first: the first part where the two differ by a number decides. */
function newerFirst(a: readonly number[], b: readonly number[]): number {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const d = (b[i] ?? 0) - (a[i] ?? 0);
		if (d !== 0 && !Number.isNaN(d)) return d;
	}
	return 0;
}

/** Claude's older installer's `app-<version>` folders, newest first: 1.10.0 before 1.9.0. */
export function newestFirst(names: readonly string[]): string[] {
	return names.filter(n => n.startsWith("app-")).toSorted((a, b) => newerFirst(versionOf(a), versionOf(b)));
}

async function windowsApp(sys: Sys, app: (typeof APPS)[AppName]): Promise<string | undefined> {
	const ps = [
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		`(Get-AppxPackage -Name '${app.windowsPackage}').InstallLocation`,
	];
	const location = (await sys.run(ps)).stdout.trim().split(/\r?\n/)[0];
	const exe = location ? join(location, "app", app.windowsExe) : undefined;
	if (exe && sys.exists(exe)) return exe;
	if (app.windowsPackage !== "Claude") return undefined;
	// Claude's older installer, before the Microsoft Store package.
	const old = join(sys.env.LOCALAPPDATA ?? join(sys.home, "AppData", "Local"), "AnthropicClaude");
	if (!sys.exists(old)) return undefined;
	return newestFirst(readdirSync(old))
		.map(name => join(old, name, "claude.exe"))
		.find(path => sys.exists(path));
}

export async function findApp(sys: Sys, name: AppName): Promise<string | undefined> {
	if (sys.platform === "darwin") return macApp(sys, APPS[name]);
	if (sys.platform === "win32") return windowsApp(sys, APPS[name]);
	return undefined;
}

export async function findAgents(sys: Sys): Promise<Agents> {
	const [chatgpt, claudeApp] = await Promise.all([findApp(sys, "chatgpt"), findApp(sys, "claude")]);
	// ChatGPT desktop carries its own codex command, which installs plugins as that app reads them.
	const bundled =
		chatgpt && sys.platform === "darwin" ? join(chatgpt, "Contents/Resources/codex-cli/bin/codex") : undefined;
	const codex = bundled && sys.exists(bundled) ? bundled : findCommand(sys, "codex");
	const apps: Partial<Record<AppName, string>> = {};
	if (chatgpt) apps.chatgpt = chatgpt;
	if (claudeApp) apps.claude = claudeApp;
	return { omp: findCommand(sys, "omp"), claude: findCommand(sys, "claude"), codex, apps };
}

export async function isRunning(sys: Sys, name: AppName): Promise<boolean> {
	if (sys.platform === "darwin")
		return (
			(
				await sys.run(["/usr/bin/osascript", "-e", `application id "${APPS[name].bundle}" is running`])
			).stdout.trim() === "true"
		);
	const exe = APPS[name].windowsExe.replace(/\.exe$/, "");
	const ps = `@(Get-Process -Name '${exe}' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*${APPS[name].windowsPackage}*' }).Count`;
	return (
		Number((await sys.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps])).stdout.trim()) > 0
	);
}

/** Quits the app, waits for it to go, and starts it again. */
export async function restartApp(sys: Sys, name: AppName, app: string): Promise<void> {
	if (sys.platform === "darwin") {
		await sys.run(["/usr/bin/osascript", "-e", `tell application id "${APPS[name].bundle}" to quit`]);
		for (let i = 0; i < 40 && (await isRunning(sys, name)); i++) await Bun.sleep(250);
		await sys.run(["/usr/bin/open", "-b", APPS[name].bundle]);
		return;
	}
	const exe = APPS[name].windowsExe.replace(/\.exe$/, "");
	// Both apps stay in the tray when their window closes; nothing quits them more gently.
	await sys.run([
		"powershell.exe",
		"-NoProfile",
		"-NonInteractive",
		"-Command",
		`Get-Process -Name '${exe}' -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*${APPS[name].windowsPackage}*' } | Stop-Process`,
	]);
	Bun.spawn({ cmd: [app], stdin: "ignore", stdout: "ignore", stderr: "ignore" });
}

/** Opens a file with the app: Claude's own window installs a .mcpb opened with it. */
export async function openWith(sys: Sys, name: AppName, app: string, file: string): Promise<boolean> {
	if (sys.platform === "darwin") return (await sys.run(["/usr/bin/open", "-b", APPS[name].bundle, file])).code === 0;
	// Claude on Windows registers no file types; it reads a .mcpb from its command line.
	Bun.spawn({ cmd: [app, file], stdin: "ignore", stdout: "ignore", stderr: "ignore" });
	return true;
}
