#!/usr/bin/env bun
// Compiles each plugin's native programs into plugins/<name>/native/ (docs/manifests.md, "Native
// programs"): its Go command (catalog.json `program`, source in cmd/<program>/) and its Bun program
// (plugins/<name>/program/main.ts, named after the plugin). One build per platform, and a starter
// script per program that runs this system's build. `bun tools/native.ts` builds every plugin's;
// `bun tools/native.ts <name>...` the ones named; `--out <dir>` writes plugin <name>'s into
// <dir>/<name>/ instead (the dist workflow and the reproducibility test). `--release` also refuses a
// build for this system that links a library outside the system's own: a Bun that isn't Bun's
// official build (the dev shell's links Nix's ICU) makes programs that run only where it is
// installed. Needs Go and Bun: the dev shell's.
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { NATIVE_DIR, programDir } from "./build/native";
import { type CatalogEntry, validateCatalog } from "./build/schemas";

const ROOT = join(import.meta.dir, "..");

/** A platform's build: Go's and Bun's names for it, and where it goes in native/. */
export interface Target {
	goos: string;
	goarch: string;
	bun: string;
	path: (name: string) => string;
}

/** Every build: four POSIX ones the starter picks from, and Windows' (x64; ARM runs it emulated). */
export const TARGETS: Target[] = [
	{ goos: "darwin", goarch: "arm64", bun: "bun-darwin-arm64", path: n => `macos-arm64/${n}` },
	{ goos: "darwin", goarch: "amd64", bun: "bun-darwin-x64", path: n => `macos-x64/${n}` },
	{ goos: "linux", goarch: "arm64", bun: "bun-linux-arm64", path: n => `linux-arm64/${n}` },
	{ goos: "linux", goarch: "amd64", bun: "bun-linux-x64", path: n => `linux-x64/${n}` },
	{ goos: "windows", goarch: "amd64", bun: "bun-windows-x64", path: n => `${n}.exe` },
];

/**
 * `bun build`'s arguments for one target: a standalone program that reads no bunfig.toml, .env,
 * tsconfig.json or package.json from the folder it runs in, so a cloned repo can't change it.
 */
export function bunBuildArgs(entry: string, out: string, t: Target): string[] {
	return [
		"build",
		"--compile",
		`--target=${t.bun}`,
		"--no-compile-autoload-bunfig",
		"--no-compile-autoload-dotenv",
		"--no-compile-autoload-tsconfig",
		"--no-compile-autoload-package-json",
		"--outfile",
		out,
		entry,
	];
}

/**
 * The libraries in `otool -L` output that aren't the system's own: macOS programs may link only
 * /usr/lib and /System. The first line names the file itself.
 */
export function foreignLibraries(otool: string): string[] {
	return otool
		.split("\n")
		.slice(1)
		.map(line => line.trim().split(" (")[0])
		.filter(lib => lib !== "" && !lib.startsWith("/usr/lib/") && !lib.startsWith("/System/"));
}

/** `go build`'s arguments: the same bytes from the same source on any machine. */
export function buildArgs(version: string, out: string, pkg: string): string[] {
	const ldflags = `-s -w -buildid= -X main.version=${version}`;
	return ["build", "-trimpath", "-buildvcs=false", "-ldflags", ldflags, "-o", out, pkg];
}

/** The environment for one target's build. */
export function buildEnv(base: Record<string, string | undefined>, t: Target): Record<string, string | undefined> {
	return { ...base, CGO_ENABLED: "0", GOOS: t.goos, GOARCH: t.goarch, GOTOOLCHAIN: "local", GOFLAGS: "-mod=readonly" };
}

/** The starter, native/<name>: a POSIX script that runs this system's build. */
export function starter(name: string): string {
	return `#!/bin/sh
# Runs this system's build of ${name}: native/<platform>/${name} here, native/${name}.exe on
# Windows (which finds it by this name alone). Built by tools/native.ts; not committed.
here=$(dirname -- "$0") || exit 1
case $(uname -s)-$(uname -m) in
Darwin-arm64) p=macos-arm64 ;;
Darwin-x86_64) p=macos-x64 ;;
Linux-aarch64 | Linux-arm64) p=linux-arm64 ;;
Linux-x86_64 | Linux-amd64) p=linux-x64 ;;
MINGW* | MSYS* | CYGWIN*) exec "$here/${name}.exe" "$@" ;;
*)
  printf '${name}: no build for %s %s\\n' "$(uname -s)" "$(uname -m)" >&2
  exit 1
  ;;
esac
exec "$here/$p/${name}" "$@"
`;
}

async function run(tool: "go" | "bun", args: string[], env: Record<string, string | undefined>): Promise<void> {
	const command = tool === "bun" ? process.execPath : tool;
	const child = Bun.spawn([command, ...args], { cwd: ROOT, env, stdout: "ignore", stderr: "pipe" });
	const [code, err] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	if (code !== 0) throw new Error(`${tool} ${args.join(" ")} failed:\n${err.trim()}`);
}

/** catalog.json's entries by plugin name. */
export async function catalogEntries(): Promise<Map<string, CatalogEntry>> {
	const parsed: unknown = JSON.parse(await readFile(join(ROOT, "catalog.json"), "utf8"));
	if (!validateCatalog(parsed)) throw new Error("catalog.json fails its schema: run bun tools/build.ts --check");
	return new Map(parsed.plugins.map(entry => [entry.name, entry]));
}

/** A plugin's native programs: its Go command and whether it has a Bun program. */
export interface WithProgram {
	name: string;
	program?: string;
	bun: boolean;
}

/** The Bun program's entry point in a plugin. */
export function bunEntry(name: string): string {
	return `plugins/${name}/program/main.ts`;
}

/** The programs this system runs, of those built into `dir`: the builds `--release` checks. */
function ownBuilds(dir: string, names: string[]): string[] {
	if (process.platform !== "darwin") return [];
	const own = TARGETS.find(t => t.goos === "darwin" && t.goarch === (process.arch === "arm64" ? "arm64" : "amd64"));
	return own ? names.map(n => join(dir, own.path(n))) : [];
}

/** For each file, the libraries it links that aren't the system's own (`foreignLibraries`). */
export async function linkProblems(files: string[]): Promise<string[]> {
	const out: string[] = [];
	for (const file of files) {
		const otool = Bun.spawnSync(["otool", "-L", file]);
		for (const lib of foreignLibraries(otool.stdout.toString())) out.push(`${file} links ${lib}`);
	}
	return out;
}

/** The macOS builds of `names` in `dir`. */
function macBuilds(dir: string, names: string[]): string[] {
	return TARGETS.filter(t => t.goos === "darwin").flatMap(t => names.map(n => join(dir, t.path(n))));
}

/** Bun's JavaScript engine runs 8 times slower without JIT, which the hardened runtime refuses unless allowed. */
export const BUN_ENTITLEMENTS = join(import.meta.dir, "bun.entitlements");

/**
 * Signs each file: ad hoc with "-", else with that Developer ID, hardened, for notarization, with
 * `entitlements` when given.
 */
export function sign(files: string[], identity: string, entitlements?: string): void {
	const hardened = ["--options", "runtime", "--timestamp", ...(entitlements ? ["--entitlements", entitlements] : [])];
	const how = identity === "-" ? ["--sign", "-"] : [...hardened, "--sign", identity];
	for (const file of files) {
		const signed = Bun.spawnSync(["codesign", "--force", ...how, file], { stderr: "pipe" });
		if (signed.exitCode !== 0) throw new Error(`codesign ${file}: ${signed.stderr.toString().trim()}`);
	}
}

/**
 * Signs the macOS builds on a Mac. Bun signs what it compiles, but its signature of a build for
 * another architecture is invalid and macOS kills that program at launch, so Bun's builds are
 * signed again: ad hoc, or with PIEBIRD_CODESIGN_IDENTITY when set, which signs Go's too. A
 * release is always ad hoc: it is built unsigned (docs/manifests.md, "Releases").
 */
function signMacBuilds(dir: string, { name, program, bun }: WithProgram, release: boolean): void {
	if (process.platform !== "darwin") {
		if (release) throw new Error("a release builds its macOS programs on a Mac, which signs them ad hoc");
		return;
	}
	const identity = release ? undefined : process.env.PIEBIRD_CODESIGN_IDENTITY;
	if (bun) sign(macBuilds(dir, [name]), identity ?? "-", BUN_ENTITLEMENTS);
	if (identity !== undefined && program !== undefined) sign(macBuilds(dir, [program]), identity);
}

function compile(plugin: WithProgram, staging: string, version: string): Promise<void[]> {
	const { name, program, bun } = plugin;
	const go =
		program === undefined
			? []
			: TARGETS.map(t =>
					run(
						"go",
						buildArgs(version, join(staging, t.path(program)), `./${programDir(program)}`),
						buildEnv(process.env, t),
					),
				);
	const js = bun
		? TARGETS.map(t => run("bun", bunBuildArgs(bunEntry(name), join(staging, t.path(name)), t), process.env))
		: [];
	return Promise.all([...go, ...js]);
}

/** Builds the programs of `plugin` into `dir` (replaced whole); the Go one gets its plugin.json version. */
export async function buildPlugin(plugin: WithProgram, dir: string, release = false): Promise<void> {
	const { name, program, bun } = plugin;
	const manifest: unknown = JSON.parse(await readFile(join(ROOT, "plugins", name, "plugin.json"), "utf8"));
	const version = typeof manifest === "object" && manifest && "version" in manifest ? String(manifest.version) : "dev";
	const staging = `${dir}.building`;
	await rm(staging, { recursive: true, force: true });
	await mkdir(staging, { recursive: true });
	const names = [...(program === undefined ? [] : [program]), ...(bun ? [name] : [])];
	await compile(plugin, staging, version);
	signMacBuilds(staging, plugin, release);
	if (release) {
		const problems = await linkProblems(ownBuilds(staging, names));
		if (problems.length > 0) throw new Error(`not a release build:\n${problems.join("\n")}`);
	}
	for (const n of names) {
		await writeFile(join(staging, n), starter(n));
		await chmod(join(staging, n), 0o755);
	}
	await rm(dir, { recursive: true, force: true });
	await rename(staging, dir);
}

/** The plugins with a program, of those named (all when none are). */
export function withPrograms(entries: Map<string, CatalogEntry>, named: string[]): WithProgram[] {
	const out: WithProgram[] = [];
	for (const name of named.length > 0 ? named : entries.keys()) {
		const program = entries.get(name)?.program;
		const bun = existsSync(join(ROOT, bunEntry(name)));
		if (program !== undefined || bun) out.push({ name, ...(program === undefined ? {} : { program }), bun });
		else if (named.length > 0) throw new Error(`${name} has no program: no catalog.json program, no program/main.ts`);
	}
	return out;
}

async function main(argv: string[]): Promise<number> {
	const release = argv.includes("--release");
	const args = argv.filter(a => a !== "--release");
	const at = args.indexOf("--out");
	const given = at >= 0 ? args[at + 1] : undefined;
	// Named whole: Go and Bun build from the plugins' folder, whatever folder this runs in.
	const out = given ? resolve(given) : undefined;
	const named = at >= 0 ? args.filter((_, i) => i !== at && i !== at + 1) : args;
	if (at >= 0 && !out) throw new Error("--out needs a folder");
	for (const plugin of withPrograms(await catalogEntries(), named)) {
		const dir = out ? join(out, plugin.name) : join(ROOT, "plugins", plugin.name, NATIVE_DIR);
		await buildPlugin(plugin, dir, release);
		console.log(`built: ${dir}`);
	}
	return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
