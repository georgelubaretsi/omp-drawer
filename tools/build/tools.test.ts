import { afterEach, describe, expect, test } from "bun:test";
import { chmod, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, problems, put, tree } from "./fixtures";
import { build, check } from "./output";
import { MCP_SCHEMA } from "./schemas";
import { LAUNCHER_TEMPLATE, LOCK_COMMAND, PINS_HEADER, PLATFORMS } from "./tools";

afterEach(cleanup);

const KEY = "github:Microck/kagi-cli";
const TOML = `[tools]\n"${KEY}" = { version = "0.20.1", filter_bins = "kagi" }\n`;
const T = `plugins/demo/mise.toml: tools.${JSON.stringify(KEY)}:`;
const L = "plugins/demo/mise.lock:";
const REFRESH = `run \`${LOCK_COMMAND}\` in its folder from the dev shell`;

const url = (version: string, platform: string) =>
	`https://github.com/Microck/kagi-cli/releases/download/v${version}/kagi-${platform}.tar.gz`;
const sum = (platform: string) => `sha256:${String(PLATFORMS.indexOf(platform)).repeat(64)}`;

/** A mise.lock as `mise lock` writes it, for `version` on `platforms`; `linuxX64` overrides that platform's fields. */
function lock(version = "0.20.1", platforms = PLATFORMS, linuxX64: Record<string, string> = {}): string {
	let out = `[[tools.${JSON.stringify(KEY)}]]\nversion = "${version}"\nbackend = "${KEY}"\n`;
	for (const p of platforms) {
		const fields = { checksum: sum(p), url: url(version, p), ...(p === "linux-x64" ? linuxX64 : {}) };
		out += `\n[tools.${JSON.stringify(KEY)}."platforms.${p}"]\n`;
		for (const [k, v] of Object.entries(fields)) out += `${k} = "${v}"\n`;
	}
	return out;
}

const OTHER = "github:someone/kagi";
const AT = `${L} ${JSON.stringify(KEY)} 0.20.1 platforms.linux-x64:`;
const unpackable = (name: string) => [
	`${AT} url names ${name}, which the launcher can't unpack; it takes .tar.gz, .tgz, .tar.xz, .zip or a bare binary`,
];
// linux-x64's url, and the problems it has.
const URLS: [string, string[]][] = [
	["https://example.com/kagi.zip", []],
	["https://example.com/kagi.tar.xz", []],
	["https://example.com/kagi-linux-x64", []],
	["https://example.com/kagi.tar.bz2", unpackable("kagi.tar.bz2")],
	["https://example.com/kagi.tar.zst", unpackable("kagi.tar.zst")],
	["https://example.com/kagi.deb", unpackable("kagi.deb")],
	["https://example.com/kagi.TGZ", unpackable("kagi.TGZ")],
	["https://example.com/kagi.tar.gz?raw=1", [`${AT} url must not have a query or fragment`]],
	["https://example.com/k agi.tar.gz", [`${AT} url must not contain whitespace or control characters`]],
];

const CASES: { name: string; toml?: string; lock?: string; errors: string[] }[] = [
	{ name: "a github tool with its lock", toml: TOML, lock: lock(), errors: [] },
	{ name: "neither file", errors: [] },
	{
		name: "an npm tool",
		toml: `[tools]\n"npm:prettier" = { version = "3.0.0", filter_bins = "prettier" }\n`,
		lock: lock(),
		errors: [
			`plugins/demo/mise.toml: tools."npm:prettier": only the github: backend is supported; npm and Python tools need a strict lockfile install, not supported yet`,
		],
	},
	{
		name: "no version",
		toml: `[tools]\n"${KEY}" = { filter_bins = "kagi" }\n`,
		lock: lock(),
		errors: [`${T} version is required`],
	},
	{
		name: "a version string without filter_bins",
		toml: `[tools]\n"${KEY}" = "0.20.1"\n`,
		lock: lock(),
		errors: [`${T} version is required`, `${T} filter_bins is required (the executable names, comma-separated)`],
	},
	{
		name: "an executable name that isn't one",
		toml: `[tools]\n"${KEY}" = { version = "0.20.1", filter_bins = "kagi,bad name" }\n`,
		lock: lock(),
		errors: [`${T} filter_bins: "bad name" is not an executable name`],
	},
	{
		name: "a version bumped without refreshing mise.lock",
		toml: TOML.replace("0.20.1", "0.20.2"),
		lock: lock(),
		errors: [`${L} no ${JSON.stringify(KEY)} entry for version 0.20.2 (mise.toml's); ${REFRESH}`],
	},
	{
		name: "a platform missing from mise.lock",
		toml: TOML,
		lock: lock("0.20.1", ["macos-arm64", "macos-x64", "linux-x64"]),
		errors: [`${L} ${JSON.stringify(KEY)} 0.20.1 platforms.linux-arm64 is missing; ${REFRESH}`],
	},
	{
		name: "a plain http URL and a checksum that isn't sha256",
		toml: TOML,
		lock: lock("0.20.1", PLATFORMS, { url: "http://example.com/kagi.tar.gz", checksum: "blake3:abc" }),
		errors: [
			`${L} ${JSON.stringify(KEY)} 0.20.1 platforms.linux-x64: url must be an https URL`,
			`${L} ${JSON.stringify(KEY)} 0.20.1 platforms.linux-x64: checksum must be "sha256:" and 64 lowercase hex digits`,
		],
	},
	{
		name: "mise.toml without mise.lock",
		toml: TOML,
		errors: [`${L} missing; run \`${LOCK_COMMAND}\` in its folder from the dev shell`],
	},
	{
		name: "mise.lock without mise.toml",
		lock: lock(),
		errors: [`${L} there is no mise.toml next to it; add one or remove mise.lock`],
	},
	{
		name: "an empty [tools]",
		toml: "[tools]\n",
		lock: lock(),
		errors: ["plugins/demo/mise.toml: [tools] must list at least one tool"],
	},
	{
		name: "a version with whitespace",
		toml: TOML.replace("0.20.1", "0.20.1 beta"),
		lock: lock(),
		errors: [`${T} version must not contain whitespace or control characters`],
	},
	{
		name: "an executable two tools claim",
		toml: `${TOML}"${OTHER}" = { version = "0.20.1", filter_bins = "kagi" }\n`,
		lock: `${lock()}\n${lock().replaceAll(KEY, OTHER)}`,
		errors: [
			`plugins/demo/mise.toml: filter_bins: "kagi" is in both tools.${JSON.stringify(KEY)} and tools.${JSON.stringify(OTHER)}; the launcher runs one pinned build per executable name`,
		],
	},
	...URLS.map(([u, errors]) => ({
		name: `url ${u}`,
		toml: TOML,
		lock: lock("0.20.1", PLATFORMS, { url: u }),
		errors,
	})),
];

describe("mise.toml and mise.lock", () => {
	for (const c of CASES) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			if (c.toml !== undefined) await put(root, "plugins/demo/mise.toml", c.toml);
			if (c.lock !== undefined) await put(root, "plugins/demo/mise.lock", c.lock);
			expect(await problems(root)).toEqual(c.errors);
		});
	}

	test("mise.toml that isn't TOML (a tool listed twice)", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/demo/mise.toml", `${TOML}"${KEY}" = { version = "0.20.0", filter_bins = "kagi" }\n`);
		await put(root, "plugins/demo/mise.lock", lock());
		const found = await problems(root);
		expect(found).toHaveLength(1);
		expect(found[0]).toStartWith("plugins/demo/mise.toml: invalid TOML: ");
	});
});

const BIN = "plugins/demo/bin";
const ROWS = PLATFORMS.flatMap(p =>
	["kagi", "kagi-mcp"].map(exe => `${exe}\t0.20.1\t${p}\t${url("0.20.1", p)}\t${sum(p).slice(7)}\n`),
);

/** The demo plugin pinning `toml`'s tools, built. */
async function pinned(toml = TOML): Promise<string> {
	const root = await tree(["omp"]);
	await put(root, "plugins/demo/mise.toml", toml);
	await put(root, "plugins/demo/mise.lock", lock());
	await build(root);
	return root;
}

describe("bin/launcher and bin/pins", () => {
	test("one line per executable per platform, and the launcher template as it is, executable", async () => {
		const root = await pinned(TOML.replace('"kagi"', '"kagi, kagi-mcp"'));
		expect(await readFile(join(root, BIN, "pins"), "utf8")).toBe(`${PINS_HEADER}\n${ROWS.join("")}`);
		expect(await readFile(join(root, BIN, "launcher"), "utf8")).toBe(await readFile(LAUNCHER_TEMPLATE, "utf8"));
		expect((await stat(join(root, BIN, "launcher"))).mode & 0o777).toBe(0o755);
		expect(await check(root)).toEqual([]);
	});

	test("--check fails when a generated file is edited by hand, or the launcher loses its mode", async () => {
		const root = await pinned();
		await put(root, `${BIN}/pins`, `${PINS_HEADER}\nkagi\t0.20.1\tmacos-arm64\thttps://example.com/k\tabc\n`);
		await put(root, `${BIN}/launcher`, '#!/bin/sh\nexec kagi "$@"\n');
		expect(await check(root)).toEqual([`differs: ${BIN}/launcher`, `differs: ${BIN}/pins`]);
		await build(root);
		await chmod(join(root, BIN, "launcher"), 0o644);
		expect(await check(root)).toEqual([`not executable: ${BIN}/launcher`]);
		expect(await build(root)).toEqual([`wrote: ${BIN}/launcher`]);
		expect(await check(root)).toEqual([]);
	});

	test("bin/ files left behind once mise.toml is gone fail --check, and the build deletes them", async () => {
		const root = await pinned();
		await rm(join(root, "plugins/demo/mise.toml"));
		await rm(join(root, "plugins/demo/mise.lock"));
		expect(await check(root)).toEqual([`unexpected: ${BIN}/launcher`, `unexpected: ${BIN}/pins`]);
		expect(await build(root)).toEqual([`deleted: ${BIN}/launcher`, `deleted: ${BIN}/pins`]);
		expect(await stat(join(root, BIN)).catch(() => undefined)).toBeUndefined();
	});
});

describe("an MCP server run through ./bin/launcher", () => {
	const MCP = {
		$schema: MCP_SCHEMA,
		mcpServers: { kagi: { type: "stdio", command: "./bin/launcher", args: ["kagi", "mcp"] } },
	};

	test("builds from a clean tree, before bin/ exists, when mise.toml pins the tool", async () => {
		const root = await tree(["omp", "claude"]);
		await put(root, "plugins/demo/mise.toml", TOML);
		await put(root, "plugins/demo/mise.lock", lock());
		await put(root, "plugins/demo/mcp.json", MCP);
		const changed = await build(root);
		expect(changed).toContain(`wrote: ${BIN}/launcher`);
		expect(changed).toContain(`wrote: ${BIN}/pins`);
		expect(await check(root)).toEqual([]);
	});

	test("without mise.toml nothing generates it, so it is a missing bundled file", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/demo/mcp.json", MCP);
		expect(await problems(root)).toEqual([
			"plugins/demo/mcp.json: /mcpServers/kagi/command must name a file bundled in the plugin (Agent Plugins §7.2.1)",
		]);
	});
});
