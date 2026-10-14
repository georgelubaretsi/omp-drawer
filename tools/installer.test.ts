import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUNDLE_ID, EXECUTABLE, infoPlist } from "./installer/mac";
import { carried, missingNatives, type Platform } from "./installer/payload";

const tmp = mkdtempSync(join(tmpdir(), "installer-tool-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("what an installer carries of a plugin", () => {
	const paths = [
		"plugin.json",
		".claude-plugin/plugin.json",
		"skills/x/SKILL.md",
		"native/prog",
		"native/prog.exe",
		"native/macos-arm64/prog",
		"native/macos-x64/prog",
		"native/linux-x64/prog",
		"test/a.test.ts",
		"com.anthropic.claudecode/tests/register.test.ts",
		"node_modules/x/index.js",
		".claude-plugin/types/claude-code.d.ts",
	];
	const kept = (platform: Platform) => paths.filter(p => carried(p, platform));
	const common = ["plugin.json", ".claude-plugin/plugin.json", "skills/x/SKILL.md", "native/prog"];

	test("is its own platform's programs, never tests or what the hosts don't get", () => {
		expect(kept("macos-arm64")).toEqual([...common, "native/macos-arm64/prog"]);
		expect(kept("macos-x64")).toEqual([...common, "native/macos-x64/prog"]);
		expect(kept("windows-x64")).toEqual([...common.slice(0, 3), "native/prog", "native/prog.exe"]);
	});

	test("with a program not built for the platform, names it", () => {
		const files = ["plugins/a/native/macos-arm64/a"].map(path => ({ path, mode: 0o755, data: new Uint8Array() }));
		const programs = new Map([["a", ["a", "a-vault"]]]);
		expect(missingNatives(files, programs, "macos-arm64")).toEqual(["plugins/a/native/macos-arm64/a-vault"]);
		expect(missingNatives(files, programs, "windows-x64")).toEqual([
			"plugins/a/native/a.exe",
			"plugins/a/native/a-vault.exe",
		]);
	});
});

describe.skipIf(process.platform !== "darwin")("the macOS app's Info.plist", () => {
	test("reads as an app with no Dock icon, run by its program", () => {
		const file = join(tmp, "Info.plist");
		writeFileSync(file, infoPlist("1.2.3"));
		const ran = Bun.spawnSync(["plutil", "-convert", "json", "-o", "-", file]);
		expect(ran.exitCode).toBe(0);
		expect(JSON.parse(ran.stdout.toString())).toMatchObject({
			CFBundleIdentifier: BUNDLE_ID,
			CFBundleExecutable: EXECUTABLE,
			CFBundlePackageType: "APPL",
			CFBundleShortVersionString: "1.2.3",
			LSUIElement: true,
		});
	});
});
