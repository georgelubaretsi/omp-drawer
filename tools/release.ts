#!/usr/bin/env bun
// `bun tools/release.ts <plugin>/v<version> --out <dir>`: what the release workflow publishes for
// a plugin's tag. The tag's version must be the plugin's (plugin.json). Its native programs are
// built for every platform as a release (tools/native.ts), each macOS build is notarized with
// the App Store Connect key in APPLE_NOTARY_KEY (a .p8 file), APPLE_NOTARY_KEY_ID and
// APPLE_NOTARY_ISSUER, each Windows build is signed with the code-signing certificate in
// WINDOWS_CERTIFICATE (a .pfx file, its password in WINDOWS_CERTIFICATE_PASSWORD) when there is
// one, and the builds are packed one archive per platform, <plugin>-<version>-<platform>.tar.gz
// holding native/ as the plugin carries it, with SHA256SUMS. The tag installer/v<version> (the
// version in package.json) releases the desktop installers instead (tools/installer.ts).
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { releaseInstallers } from "./installer";
import { buildPlugin, bunEntry, catalogEntries, TARGETS, type WithProgram } from "./native";
import { notaryCredentials, spawn } from "./signing";

const ROOT = join(import.meta.dir, "..");

export interface Tag {
	plugin: string;
	version: string;
}

/** The plugin and version a release tag names: `<plugin>/v<version>`. */
export function parseTag(tag: string): Tag {
	const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)\/v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
	if (!match) throw new Error(`release tag ${tag} isn't <plugin>/v<version>`);
	return { plugin: match[1], version: match[2] };
}

/** A platform's archive and the files of `names` it holds, from native/'s layout. */
export function platformFiles(names: string[]): Map<string, string[]> {
	const out = new Map<string, string[]>();
	for (const t of TARGETS) {
		const platform = t.goos === "windows" ? "windows-x64" : dirname(t.path("x"));
		const files = names.map(n => t.path(n));
		// A POSIX build is run through its starter, native/<name>.
		out.set(platform, t.goos === "windows" ? files : [...files, ...names]);
	}
	return out;
}

/** `sha256sum`'s lines for `files` (name → bytes), sorted by name. */
export function sha256sums(files: Map<string, Uint8Array>): string {
	return [...files.keys()]
		.toSorted()
		.map(
			name =>
				`${new Bun.CryptoHasher("sha256").update(files.get(name) ?? new Uint8Array()).digest("hex")}  ${name}\n`,
		)
		.join("");
}

/** Notarizes each macOS build: Apple scans it and records it, so Gatekeeper lets it run. */
async function notarize(native: string, names: string[]): Promise<void> {
	const credentials = notaryCredentials();
	const work = await mkdtemp(join(tmpdir(), "notarize-"));
	try {
		for (const t of TARGETS.filter(target => target.goos === "darwin")) {
			for (const name of names) {
				const zip = join(work, `${basename(dirname(t.path(name)))}-${name}.zip`);
				spawn(["ditto", "-c", "-k", "--keepParent", join(native, t.path(name)), zip]);
				const answer: unknown = JSON.parse(
					spawn(["xcrun", "notarytool", "submit", zip, ...credentials, "--wait", "--output-format", "json"]),
				);
				const status =
					typeof answer === "object" && answer !== null && "status" in answer ? answer.status : undefined;
				if (status !== "Accepted") throw new Error(`notarizing ${t.path(name)}: ${JSON.stringify(answer)}`);
			}
		}
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

/** The archives of `native/` (built for `names`) into `out`, with their SHA256SUMS. */
export async function pack(native: string, tag: Tag, names: string[], out: string): Promise<void> {
	const archives = new Map<string, Uint8Array>();
	for (const [platform, files] of platformFiles(names)) {
		const archive = `${tag.plugin}-${tag.version}-${platform}.tar.gz`;
		spawn(["tar", "-czf", join(out, archive), ...files.map(f => `native/${f}`)], dirname(native));
		archives.set(archive, await readFile(join(out, archive)));
	}
	await writeFile(join(out, "SHA256SUMS"), sha256sums(archives));
}

/** The plugin the tag releases, with its programs' names; refused unless the versions agree. */
async function released(tag: Tag): Promise<{ plugin: WithProgram; names: string[] }> {
	const manifest: unknown = JSON.parse(await readFile(join(ROOT, "plugins", tag.plugin, "plugin.json"), "utf8"));
	const version =
		typeof manifest === "object" && manifest !== null && "version" in manifest ? manifest.version : undefined;
	if (version !== tag.version) throw new Error(`${tag.plugin} is version ${String(version)}, not ${tag.version}`);
	const program = (await catalogEntries()).get(tag.plugin)?.program;
	const bun = await Bun.file(join(ROOT, bunEntry(tag.plugin))).exists();
	const names = [...(program === undefined ? [] : [program]), ...(bun ? [tag.plugin] : [])];
	if (names.length === 0) throw new Error(`${tag.plugin} has no native program to release`);
	return { plugin: { name: tag.plugin, ...(program === undefined ? {} : { program }), bun }, names };
}

/** The desktop installers for every platform into `out`, with their SHA256SUMS. */
async function installers(version: string, out: string): Promise<void> {
	const sums = new Map<string, Uint8Array>();
	for (const file of await releaseInstallers(version, out))
		sums.set(basename(file), new Uint8Array(await readFile(file)));
	await writeFile(join(out, "SHA256SUMS"), sha256sums(sums));
}

/** A plugin's programs, each platform's in an archive, into `out`, with their SHA256SUMS. */
async function programs(tag: Tag, out: string): Promise<void> {
	const { plugin, names } = await released(tag);
	const native = join(out, "build", "native");
	await mkdir(out, { recursive: true });
	// buildPlugin signs the Windows builds of a release; macOS's are notarized here.
	await buildPlugin(plugin, native, true);
	await notarize(native, names);
	await pack(native, tag, names, out);
	await rm(join(out, "build"), { recursive: true, force: true });
}

async function main(argv: string[]): Promise<number> {
	const at = argv.indexOf("--out");
	const out = at >= 0 ? argv[at + 1] : undefined;
	const tagArg = argv.find((a, i) => !a.startsWith("--") && i !== at + 1);
	if (!out || !tagArg) throw new Error("usage: bun tools/release.ts <plugin>/v<version> --out <dir>");
	const tag = parseTag(tagArg);
	await (tag.plugin === "installer" ? installers(tag.version, out) : programs(tag, out));
	console.log(`released: ${out}`);
	return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
