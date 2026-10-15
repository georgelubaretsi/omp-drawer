#!/usr/bin/env bun
// `bun tools/release.ts <plugin>/v<version> --out <dir>`: what the release workflow puts in a
// plugin's draft release. The tag's version must be the plugin's (plugin.json). Its native
// programs are built for every platform as a release (tools/native.ts), unsigned (macOS's ad hoc),
// and packed one archive per platform, <plugin>-<version>-<platform>.tar.gz holding native/ as the
// plugin carries it, with SHA256SUMS. Nothing here signs. The tag installer/v<version> (the
// version in package.json) builds the desktop installers instead (tools/installer.ts).
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { releaseInstallers } from "./installer";
import { buildPlugin, bunEntry, catalogEntries, TARGETS, type WithProgram } from "./native";

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

/** Runs a command and returns its output; throws with what it said when it fails. */
function spawn(argv: string[], cwd?: string): string {
	const run = Bun.spawnSync(argv, { cwd, stdout: "pipe", stderr: "pipe" });
	if (run.exitCode !== 0) throw new Error(`${argv.join(" ")} failed:\n${run.stderr.toString().trim()}`);
	return run.stdout.toString();
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
	await buildPlugin(plugin, native, true);
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
