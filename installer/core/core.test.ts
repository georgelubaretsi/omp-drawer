import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMarketplace, withoutMarketplace } from "./claude";
import { enablePlugins, removePlugins, withEntries, withoutEntries } from "./codex";
import { packPayload, unpackPayload } from "./payload";
import { zip } from "./zip";

const tmp = mkdtempSync(join(tmpdir(), "installer-core-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const bytes = (s: string) => new TextEncoder().encode(s);

describe("the payload", () => {
	test("gives back each file with its mode", () => {
		const files = [
			{ path: "plugins/a/plugin.json", mode: 0o644, data: bytes("{}") },
			{ path: "plugins/a/native/a", mode: 0o755, data: bytes("#!/bin/sh\n") },
			{ path: "empty", mode: 0o644, data: new Uint8Array() },
		];
		expect(unpackPayload(packPayload(files)).map(f => [f.path, f.mode, new TextDecoder().decode(f.data)])).toEqual(
			files.map(f => [f.path, f.mode, new TextDecoder().decode(f.data)]),
		);
	});
	test("refuses a path that would leave its folder, packing or unpacking", () => {
		for (const path of ["../x", "a/../../x", "/etc/x", "C:/x", "a\\b", "a//b", ""])
			expect(() => packPayload([{ path, mode: 0o644, data: bytes("x") }])).toThrow();
		const crafted = Bun.gzipSync(
			bytes(`PIEBIRD-PAYLOAD-1\n${JSON.stringify({ files: [{ path: "../x", mode: 420, size: 1 }] })}\nx`),
		);
		expect(() => unpackPayload(crafted)).toThrow("would leave its folder");
	});
});

describe("the zip", () => {
	test("unzips to the same files, an executable kept executable", () => {
		const file = join(tmp, "x.zip");
		writeFileSync(
			file,
			zip([
				{ path: "manifest.json", mode: 0o644, data: bytes('{"a":1}') },
				{ path: "native/prog", mode: 0o755, data: bytes("#!/bin/sh\necho hi\n".repeat(50)) },
			]),
		);
		const out = join(tmp, "out");
		const ran = Bun.spawnSync(["unzip", "-q", "-o", file, "-d", out]);
		expect(ran.exitCode).toBe(0);
		expect(readFileSync(join(out, "manifest.json"), "utf8")).toBe('{"a":1}');
		expect(readFileSync(join(out, "native/prog"), "utf8")).toBe("#!/bin/sh\necho hi\n".repeat(50));
		expect(statSync(join(out, "native/prog")).mode & 0o777).toBe(0o755);
	});
});

describe("Codex's config.toml", () => {
	const id = "piebird-kagi-search@piebird";
	const theirs = '# mine\nmodel = "gpt-6.1-sol"\n\n[plugins."chrome@openai-bundled"]\nenabled = true\n';
	test("gets the plugins switched on, the rest as it was", () => {
		const out = enablePlugins(theirs, [id]);
		expect(out.startsWith(theirs)).toBe(true);
		expect(Bun.TOML.parse(out)).toMatchObject({
			plugins: { [id]: { enabled: true }, "chrome@openai-bundled": { enabled: true } },
		});
		expect(enablePlugins(out, [id])).toBe(out);
	});
	test("switches a plugin the person turned off back on, keeping its own settings", () => {
		const off = `[plugins."${id}"]\nenabled = false\n\n[plugins."${id}".mcp_servers.x]\nenabled = true\n`;
		expect(Bun.TOML.parse(enablePlugins(off, [id]))).toEqual({
			plugins: { [id]: { enabled: true, mcp_servers: { x: { enabled: true } } } },
		});
	});
	test("leaves a server's own switch alone when the plugin's table has none", () => {
		const noKey = `[plugins."${id}"]\n\n[plugins."${id}".mcp_servers.x]\nenabled = false\n`;
		expect(Bun.TOML.parse(enablePlugins(noKey, [id]))).toEqual({
			plugins: { [id]: { enabled: true, mcp_servers: { x: { enabled: false } } } },
		});
	});
	test("loses the plugins' tables, sub-tables included, on removal", () => {
		const both = enablePlugins(`${theirs}\n[plugins."${id}".mcp_servers.x]\nenabled = true\n`, [id]);
		const out = removePlugins(both, [id]);
		expect(Bun.TOML.parse(out)).toEqual({
			model: "gpt-6.1-sol",
			plugins: { "chrome@openai-bundled": { enabled: true } },
		});
		expect(out).toContain("# mine");
	});
	test("refuses an edit that wouldn't read back as TOML", () => {
		expect(() => enablePlugins(`[plugins."${id}"] # a comment\nenabled = false\n`, [id])).toThrow();
	});
});

describe("the personal marketplace", () => {
	const mine = { name: "mine", plugins: [{ name: "other", source: { source: "local", path: "./x" } }, { name: "a" }] };
	test("keeps the person's name and entries, replacing an older entry of ours", () => {
		const out = withEntries(mine, "piebird", [{ name: "a", category: "search" }]);
		expect(out.name).toBe("mine");
		expect(out.plugins).toEqual([
			mine.plugins[0],
			{
				name: "a",
				source: { source: "local", path: "./.codex/plugins/a" },
				policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
				category: "search",
			},
		]);
		expect(withoutEntries(out, ["a"])?.plugins).toEqual([mine.plugins[0]]);
	});
	test("is ours when the person has none", () => {
		expect(withEntries(undefined, "piebird", []).name).toBe("piebird");
	});
});

describe("Claude's settings.json", () => {
	test("gains the marketplace and its plugins, and loses only those", () => {
		const theirs = {
			model: "opus",
			enabledPlugins: { "x@other": true },
			extraKnownMarketplaces: { other: { source: { source: "github", repo: "o/r" } } },
		};
		const added = withMarketplace(theirs, "piebird", "/home/p/.agents/piebird/marketplace", ["a@piebird"]);
		expect(added).toEqual({
			model: "opus",
			enabledPlugins: { "x@other": true, "a@piebird": true },
			extraKnownMarketplaces: {
				other: theirs.extraKnownMarketplaces.other,
				piebird: { source: { source: "directory", path: "/home/p/.agents/piebird/marketplace" } },
			},
		});
		expect(withoutMarketplace(added, "piebird")).toEqual(theirs);
	});
});
