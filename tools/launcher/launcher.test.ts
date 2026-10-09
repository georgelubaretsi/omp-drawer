// The launcher template run as plugins run it: `sh bin/launcher <exe> [args...]`, with a pins file
// next to it pointing at a fixture download through a file:// URL.
import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARCHIVE_SUFFIXES } from "../build/tools";

const TEMPLATE = join(import.meta.dir, "launcher.sh");
// A name no real tool on PATH has; its override variable is PINNED_DEMO_BIN.
const EXE = "pinned-demo";
const VERSION = "0.20.1";
const PLATFORM = `${process.platform === "darwin" ? "macos" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
// The system's own tools first (BSD ones on macOS), as plugins find them, then the rest.
const PATH = `/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH ?? ""}`;

/** A fixture tool: reports `version` for --version, otherwise prints `<label>: <args>`. */
function tool(label: string, version: string): string {
	return `#!/bin/sh\ncase \${1:-} in --version) echo "${EXE} ${version}" ;; *) echo "${label}: $*" ;; esac\n`;
}

// How to pack the fixture tool, run in its folder, for each URL ending: every one the build accepts
// (ARCHIVE_SUFFIXES), and none for a bare binary.
const PACK: Record<string, (out: string) => string[]> = {
	".tar.gz": out => ["tar", "-czf", out, EXE],
	".tgz": out => ["tar", "-czf", out, EXE],
	".tar.xz": out => ["tar", "-cJf", out, EXE],
	".zip": out => ["zip", "-q", out, EXE],
	"": out => ["cp", EXE, out],
};

interface Fixture {
	root: string;
	launcher: string;
	data: string;
	asset: string;
	cached: string;
}

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true })));
});

/** A plugin folder with bin/launcher and bin/pins pinning EXE to a download packed as `suffix`; `sum` overrides the pinned sha256. */
async function fixture(sum?: string, suffix = ".tar.gz"): Promise<Fixture> {
	const root = await mkdtemp(join(tmpdir(), "omp-drawer-launcher-"));
	roots.push(root);
	const launcher = join(root, "demo/bin/launcher");
	await mkdir(join(root, "demo/bin"), { recursive: true });
	await copyFile(TEMPLATE, launcher);

	await mkdir(join(root, "src"));
	await writeFile(join(root, "src", EXE), tool("pinned", VERSION), { mode: 0o755 });
	const asset = join(root, `${EXE}-v${VERSION}${suffix}`);
	expect(Bun.spawnSync(PACK[suffix](asset), { cwd: join(root, "src") }).exitCode).toBe(0);
	const actual = new Bun.CryptoHasher("sha256").update(await Bun.file(asset).arrayBuffer()).digest("hex");
	const line = [EXE, VERSION, PLATFORM, `file://${asset}`, sum ?? actual].join("\t");
	await writeFile(join(root, "demo/bin/pins"), `# header\n${line}\n`);

	const data = join(root, "data");
	const cached = join(data, "tools", EXE, VERSION, PLATFORM, EXE);
	return { root, launcher, data, asset, cached };
}

/** A folder `dir` holding EXE as `content`, executable, to put on PATH or point an override at. */
async function binDir(f: Fixture, dir: string, content: string): Promise<string> {
	await mkdir(join(f.root, dir));
	await writeFile(join(f.root, dir, EXE), content, { mode: 0o755 });
	return join(f.root, dir);
}

function run(f: Fixture, args: string[], env: Record<string, string> = {}) {
	const r = Bun.spawnSync(["sh", f.launcher, ...args], {
		env: { PATH, HOME: f.root, PLUGIN_DATA: f.data, ...env },
	});
	return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

describe("launcher", () => {
	test("downloads into an empty data folder, verifies, caches and runs; stdout is the tool's own", async () => {
		const f = await fixture();
		const r = run(f, [EXE, "a", "b c"]);
		expect(r).toMatchObject({ code: 0, stdout: "pinned: a b c\n" });
		expect(r.stderr).toBe(`launcher: downloading ${EXE} ${VERSION} for ${PLATFORM}\n`);
		expect(await Bun.file(f.cached).exists()).toBe(true);
		expect(await readdir(join(f.data, "tools"))).toEqual([EXE]);
	});

	test("a second run uses the cache, with the download gone", async () => {
		const f = await fixture();
		expect(run(f, [EXE]).code).toBe(0);
		await rm(f.asset);
		expect(run(f, [EXE, "again"])).toEqual({ code: 0, stdout: "pinned: again\n", stderr: "" });
	});

	// Every URL ending the build accepts (tools/build/tools.ts) is one the launcher unpacks.
	for (const suffix of [...ARCHIVE_SUFFIXES, ""]) {
		test(`unpacks ${suffix === "" ? "a bare binary" : `a ${suffix} download`}`, async () => {
			expect(Object.hasOwn(PACK, suffix)).toBe(true);
			const f = await fixture(undefined, suffix);
			expect(run(f, [EXE, "x"])).toMatchObject({ code: 0, stdout: "pinned: x\n" });
		});
	}

	test("a download whose sha256 differs is refused, not cached and not run", async () => {
		const wrong = "0".repeat(64);
		const f = await fixture(wrong);
		const r = run(f, [EXE, "x"]);
		expect(r.code).toBe(1);
		expect(r.stdout).toBe("");
		expect(r.stderr).toContain(`checksum mismatch for file://${f.asset}: expected sha256 ${wrong}, got `);
		expect(r.stderr).toMatch(/got [0-9a-f]{64}; not running it\n$/);
		expect(await Bun.file(f.cached).exists()).toBe(false);
		expect(await readdir(join(f.data, "tools"))).toEqual([]);
	});

	test("the pinned version on PATH is used without a download", async () => {
		const f = await fixture();
		await rm(f.asset);
		const dir = await binDir(f, "path", tool("on-path", VERSION));
		const r = run(f, [EXE, "x"], { PATH: `${dir}:${PATH}` });
		expect(r).toEqual({ code: 0, stdout: "on-path: x\n", stderr: "" });
		expect(await Bun.file(f.cached).exists()).toBe(false);
	});

	test("another version on PATH is skipped with the reason, and the pinned one used", async () => {
		const f = await fixture();
		const dir = await binDir(f, "path", tool("on-path", "0.19.0"));
		const r = run(f, [EXE, "x"], { PATH: `${dir}:${PATH}` });
		expect(r.code).toBe(0);
		expect(r.stdout).toBe("pinned: x\n");
		expect(r.stderr).toContain(
			`launcher: skipping ${dir}/${EXE}: it reports version 0.19.0, the pin is ${VERSION}\n`,
		);
	});

	// The pinned version must be a whole word of the --version output.
	const reports: [string, boolean][] = [
		[VERSION, true],
		[`v${VERSION}`, true],
		[`${VERSION}0`, false],
		[`1${VERSION}`, false],
		[`${VERSION}-rc.1`, false],
	];
	for (const [reported, used] of reports) {
		test(`PATH reporting ${reported} against the pin ${VERSION}: ${used ? "used" : "skipped"}`, async () => {
			const f = await fixture();
			const dir = await binDir(f, "path", tool("on-path", reported));
			const r = run(f, [EXE], { PATH: `${dir}:${PATH}` });
			expect(r.stdout).toBe(used ? "on-path: \n" : "pinned: \n");
		});
	}

	test("<EXE>_BIN wins over PATH and the cache", async () => {
		const f = await fixture();
		await rm(f.asset);
		const path = await binDir(f, "path", tool("on-path", VERSION));
		const override = await binDir(f, "override", tool("override", "9.9.9"));
		const r = run(f, [EXE, "x"], { PATH: `${path}:${PATH}`, PINNED_DEMO_BIN: join(override, EXE) });
		expect(r).toEqual({ code: 0, stdout: "override: x\n", stderr: "" });
	});

	test("an exe without a pin exits 127", async () => {
		const f = await fixture();
		const r = run(f, ["other", "x"]);
		expect(r).toEqual({ code: 127, stdout: "", stderr: `launcher: no pin for "other" in ${f.root}/demo/bin/pins\n` });
	});
});
