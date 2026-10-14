// The macOS installer's packaging: the program as an app with no Dock icon (its window is the
// browser page), signed with the JIT entitlement Bun needs, inside a disk image; for a release,
// signed with the Developer ID and the image notarized and stapled.
import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const APP_NAME = "Install piebird";
export const EXECUTABLE = "piebird-installer";
/** The installer's bundle id; Gatekeeper and the system's records know the app by it. */
export const BUNDLE_ID = "io.github.piebird.installer";

function escape(text: string): string {
	return text.replace(/[&<>]/g, c => `&#${c.charCodeAt(0)};`);
}

export function infoPlist(version: string): string {
	const keys: [string, string][] = [
		["CFBundleDevelopmentRegion", "<string>en</string>"],
		["CFBundleDisplayName", `<string>${APP_NAME}</string>`],
		["CFBundleExecutable", `<string>${EXECUTABLE}</string>`],
		["CFBundleIdentifier", `<string>${BUNDLE_ID}</string>`],
		["CFBundleInfoDictionaryVersion", "<string>6.0</string>"],
		["CFBundleName", `<string>${APP_NAME}</string>`],
		["CFBundlePackageType", "<string>APPL</string>"],
		["CFBundleShortVersionString", `<string>${escape(version)}</string>`],
		["CFBundleVersion", `<string>${escape(version)}</string>`],
		["LSMinimumSystemVersion", "<string>13.0</string>"],
		["LSUIElement", "<true/>"],
		["NSHighResolutionCapable", "<true/>"],
	];
	const body = keys.map(([k, v]) => `\t<key>${k}</key>\n\t${v}`).join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

function spawn(argv: string[]): string {
	const run = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
	if (run.exitCode !== 0) throw new Error(`${argv.join(" ")} failed:\n${run.stderr.toString().trim()}`);
	return run.stdout.toString();
}

/** `<dir>/Install piebird.app` around the compiled program. */
export function makeApp(program: string, dir: string, version: string): string {
	const app = join(dir, `${APP_NAME}.app`);
	rmSync(app, { recursive: true, force: true });
	mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
	cpSync(program, join(app, "Contents", "MacOS", EXECUTABLE));
	chmodSync(join(app, "Contents", "MacOS", EXECUTABLE), 0o755);
	writeFileSync(join(app, "Contents", "Info.plist"), infoPlist(version));
	writeFileSync(join(app, "Contents", "PkgInfo"), "APPL????");
	return app;
}

/** Signs the app: ad hoc with "-", else with that Developer ID, hardened, for notarization. */
export function signApp(app: string, identity: string, entitlements: string): void {
	const hardened = identity === "-" ? [] : ["--options", "runtime", "--timestamp"];
	spawn(["codesign", "--force", ...hardened, "--entitlements", entitlements, "--sign", identity, app]);
	spawn(["codesign", "--verify", "--strict", app]);
}

/** A compressed disk image holding only the app: the installer runs from it, never copied anywhere. */
export function makeDmg(app: string, out: string): void {
	const staging = `${out}.staging`;
	rmSync(staging, { recursive: true, force: true });
	mkdirSync(staging, { recursive: true });
	spawn(["ditto", app, join(staging, `${APP_NAME}.app`)]);
	rmSync(out, { force: true });
	try {
		spawn(["hdiutil", "create", "-volname", APP_NAME, "-srcfolder", staging, "-format", "UDZO", "-ov", out]);
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}

/** Signs, notarizes and staples the disk image, so it opens without a warning even offline. */
export function notarizeDmg(dmg: string, identity: string, credentials: string[]): void {
	spawn(["codesign", "--force", "--timestamp", "--sign", identity, dmg]);
	const answer: unknown = JSON.parse(
		spawn(["xcrun", "notarytool", "submit", dmg, ...credentials, "--wait", "--output-format", "json"]),
	);
	const status = typeof answer === "object" && answer !== null && "status" in answer ? answer.status : undefined;
	if (status !== "Accepted") throw new Error(`notarizing ${dmg}: ${JSON.stringify(answer)}`);
	spawn(["xcrun", "stapler", "staple", dmg]);
}
