// What the release builds share for signing: Apple's notary credentials and Windows code signing.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs a command and returns its output; throws with what it said when it fails. */
export function spawn(argv: string[], cwd?: string): string {
	const run = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe" });
	if (run.exitCode !== 0) throw new Error(`${argv.join(" ")} failed:\n${run.stderr.toString().trim()}`);
	return run.stdout.toString();
}

/** `xcrun notarytool`'s arguments for the App Store Connect key in APPLE_NOTARY_KEY (a .p8 file). */
export function notaryCredentials(): string[] {
	const { APPLE_NOTARY_KEY: key, APPLE_NOTARY_KEY_ID: id, APPLE_NOTARY_ISSUER: issuer } = process.env;
	if (!key || !id || !issuer)
		throw new Error("notarizing needs APPLE_NOTARY_KEY, APPLE_NOTARY_KEY_ID and APPLE_NOTARY_ISSUER");
	return ["--key", key, "--key-id", id, "--issuer", issuer];
}

/**
 * Signs a Windows program with osslsigncode, timestamped by Certum, when there is a certificate
 * (WINDOWS_CERTIFICATE); false when there isn't, and SmartScreen warns whoever runs it.
 */
export async function signWindowsFile(exe: string): Promise<boolean> {
	const { WINDOWS_CERTIFICATE: cert, WINDOWS_CERTIFICATE_PASSWORD: password } = process.env;
	if (!cert) return false;
	const signed = `${exe}.signed`;
	// The password goes in a file only this user can read, for as long as the signing takes: in the
	// arguments, the process list and a failure's message would show it. (osslsigncode's
	// `-readpass -` can't read the stdin Bun gives a program on macOS.)
	const dir = mkdtempSync(join(tmpdir(), "piebird-sign-"));
	try {
		const pass = join(dir, "pass");
		if (password) writeFileSync(pass, password, { mode: 0o600, flag: "wx" });
		const how = ["-pkcs12", cert, ...(password ? ["-readpass", pass] : []), "-h", "sha256"];
		spawn(["osslsigncode", "sign", ...how, "-t", "http://time.certum.pl", "-in", exe, "-out", signed]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	await rename(signed, exe);
	return true;
}
