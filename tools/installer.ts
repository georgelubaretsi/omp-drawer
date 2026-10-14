#!/usr/bin/env bun
// `bun tools/installer.ts [--platform <platform>] [--out <dir>] [--release]`: the desktop installer
// (installer/, docs/installer.md) for one platform, this computer's by default: macos-arm64 and
// macos-x64 as a disk image holding "Install piebird.app", windows-x64 as one .exe. It carries every
// catalog plugin with its native programs for that platform, which `bun tools/native.ts` builds
// first. Ad hoc signed, or with PIEBIRD_CODESIGN_IDENTITY; `--release` also refuses a Bun that isn't
// Bun's official build and notarizes the image (APPLE_NOTARY_KEY, APPLE_NOTARY_KEY_ID,
// APPLE_NOTARY_ISSUER), and signs the Windows program when WINDOWS_CERTIFICATE is set.
// `--payload <file>` writes only the plugins it would carry, for `bun installer/main.ts --payload`.
// The release workflow builds every platform's with `bun tools/release.ts installer/v<version>`.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packPayload } from "../installer/core/payload";
import { NATIVE_DIR } from "./build/native";
import { makeApp, makeDmg, notarizeDmg, signApp } from "./installer/mac";
import { missingNatives, PLATFORMS, type Platform, payloadFiles } from "./installer/payload";
import {
	BUN_ENTITLEMENTS,
	buildPlugin,
	bunBuildArgs,
	catalogEntries,
	linkProblems,
	TARGETS,
	type Target,
	withPrograms,
} from "./native";
import { notaryCredentials, signWindowsFile } from "./signing";

const ROOT = join(import.meta.dir, "..");

function hostPlatform(): Platform {
	if (process.platform === "win32") return "windows-x64";
	if (process.platform === "darwin") return process.arch === "arm64" ? "macos-arm64" : "macos-x64";
	throw new Error("the installer is for macOS and Windows; pass --platform");
}

function target(platform: Platform): Target {
	const [goos, goarch] = {
		"macos-arm64": ["darwin", "arm64"],
		"macos-x64": ["darwin", "amd64"],
		"windows-x64": ["windows", "amd64"],
	}[platform];
	const t = TARGETS.find(x => x.goos === goos && x.goarch === goarch);
	if (!t) throw new Error(`no build target for ${platform}`);
	return t;
}

/** The installer's version: package.json's. */
export function installerVersion(): string {
	const pkg: unknown = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
	return typeof pkg === "object" && pkg !== null && "version" in pkg && typeof pkg.version === "string"
		? pkg.version
		: "0.0.0";
}

/** The installer program for `platform` with `payload` built in, compiled into `work`. */
function compile(platform: Platform, payload: Uint8Array, work: string): string {
	writeFileSync(join(work, "payload.bin"), payload);
	const out = join(work, platform === "windows-x64" ? "installer.exe" : "installer");
	const [build, ...rest] = bunBuildArgs(join(ROOT, "installer/main.ts"), out, target(platform));
	// The payload is embedded beside the code, under its own name (Bun.embeddedFiles).
	const extra = ["--asset-naming=[name].[ext]", ...(platform === "windows-x64" ? ["--windows-hide-console"] : [])];
	const args = [build ?? "build", ...extra, ...rest, join(work, "payload.bin")];
	const run = Bun.spawnSync([process.execPath, ...args], { cwd: ROOT, stdout: "ignore", stderr: "pipe" });
	if (run.exitCode !== 0) throw new Error(`bun ${args.join(" ")} failed:\n${run.stderr.toString().trim()}`);
	return out;
}

async function mac(program: string, platform: Platform, out: string, release: boolean): Promise<string> {
	const identity = process.env.PIEBIRD_CODESIGN_IDENTITY;
	if (release && !identity) throw new Error("a release is signed with PIEBIRD_CODESIGN_IDENTITY");
	if (release && platform === hostPlatform()) {
		const problems = await linkProblems([program]);
		if (problems.length > 0) throw new Error(`not a release build:\n${problems.join("\n")}`);
	}
	const app = makeApp(program, join(program, ".."), installerVersion());
	signApp(app, identity ?? "-", BUN_ENTITLEMENTS);
	const dmg = join(out, `piebird-${installerVersion()}-${platform}.dmg`);
	makeDmg(app, dmg);
	if (release && identity) notarizeDmg(dmg, identity, notaryCredentials());
	return dmg;
}

async function windows(program: string, out: string, release: boolean): Promise<string> {
	const exe = join(out, `piebird-${installerVersion()}-windows-x64.exe`);
	copyFileSync(program, exe);
	if (!(await signWindowsFile(exe)) && release)
		console.log("The Windows installer is unsigned: no WINDOWS_CERTIFICATE");
	return exe;
}

/** The plugins the installer carries for `platform`; throws naming the programs not built for it. */
async function payloadFor(platform: Platform) {
	const entries = [...(await catalogEntries()).values()];
	const files = payloadFiles(
		ROOT,
		entries.map(e => e.name),
		platform,
	);
	const bun = (name: string) => files.some(f => f.path === `plugins/${name}/program/main.ts`);
	const programs = new Map(
		entries.map(e => [e.name, [...(e.program ? [e.program] : []), ...(bun(e.name) ? [e.name] : [])]]),
	);
	const missing = missingNatives(files, programs, platform);
	if (missing.length > 0) throw new Error(`not built (run bun tools/native.ts):\n${missing.join("\n")}`);
	return files;
}

/** Builds the installer for `platform` into `out`; its path. */
export async function buildInstaller(platform: Platform, out: string, release: boolean): Promise<string> {
	const files = await payloadFor(platform);
	mkdirSync(out, { recursive: true });
	const work = mkdtempSync(join(tmpdir(), "piebird-installer-"));
	try {
		const program = compile(platform, packPayload(files), work);
		return platform === "windows-x64"
			? await windows(program, out, release)
			: await mac(program, platform, out, release);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

/** A release: every plugin's programs built as a release, then every platform's installer, with SHA256SUMS. */
export async function releaseInstallers(version: string, out: string): Promise<string[]> {
	if (version !== installerVersion())
		throw new Error(`the installer is version ${installerVersion()} (package.json), not ${version}`);
	for (const plugin of withPrograms(await catalogEntries(), []))
		await buildPlugin(plugin, join(ROOT, "plugins", plugin.name, NATIVE_DIR), true);
	const made: string[] = [];
	for (const platform of PLATFORMS) made.push(await buildInstaller(platform, out, true));
	return made;
}

function option(argv: readonly string[], name: string): string | undefined {
	const at = argv.indexOf(name);
	if (at < 0) return undefined;
	const value = argv[at + 1];
	if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
	return value;
}

function platformOf(argv: readonly string[]): Platform {
	const named = option(argv, "--platform");
	const platform = PLATFORMS.find(p => p === named) ?? (named ? undefined : hostPlatform());
	if (!platform) throw new Error(`--platform is one of ${PLATFORMS.join(", ")}`);
	return platform;
}

async function main(argv: readonly string[]): Promise<number> {
	const platform = platformOf(argv);
	const payloadOnly = option(argv, "--payload");
	if (payloadOnly) {
		writeFileSync(payloadOnly, packPayload(await payloadFor(platform)));
		console.log(`built: ${payloadOnly}`);
		return 0;
	}
	const made = await buildInstaller(
		platform,
		option(argv, "--out") ?? join(ROOT, "dist", "installer"),
		argv.includes("--release"),
	);
	console.log(`built: ${made}`);
	return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
