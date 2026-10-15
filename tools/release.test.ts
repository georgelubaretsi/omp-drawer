import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanup, put, tree } from "./build/fixtures";
import { pack, parseTag, sha256sums } from "./release";

afterEach(cleanup);

describe("a release tag", () => {
	test("names the plugin and its version", () => {
		expect(parseTag("piebird-kagi-search/v1.2.3")).toEqual({ plugin: "piebird-kagi-search", version: "1.2.3" });
		expect(parseTag("piebird-sessions/v0.2.0-rc.1")).toEqual({ plugin: "piebird-sessions", version: "0.2.0-rc.1" });
	});

	test("is refused in any other shape", () => {
		for (const tag of ["v1.2.3", "piebird-sessions@1.2.3", "piebird-sessions/1.2.3", "Piebird/v1.0.0", "a/v1.2"]) {
			expect(() => parseTag(tag)).toThrow(`release tag ${tag} isn't <plugin>/v<version>`);
		}
	});
});

describe("the release's archives", () => {
	test("hold each platform's builds as native/ lays them out, with their checksums", async () => {
		const root = await tree(["omp"]);
		const native = join(root, "build", "native");
		const builds = ["macos-arm64/p", "macos-x64/p", "linux-arm64/p", "linux-x64/p", "p.exe", "p"];
		for (const b of builds) await put(root, `build/native/${b}`, `${b}\n`);
		const out = join(root, "out");
		await put(root, "out/.keep", "");
		await pack(native, { plugin: "demo", version: "1.0.0" }, ["p"], out);
		const listing = (platform: string) =>
			Bun.spawnSync(["tar", "-tzf", join(out, `demo-1.0.0-${platform}.tar.gz`)])
				.stdout.toString()
				.trim()
				.split("\n")
				.toSorted();
		expect(listing("macos-arm64")).toEqual(["native/macos-arm64/p", "native/p"]);
		expect(listing("linux-x64")).toEqual(["native/linux-x64/p", "native/p"]);
		expect(listing("windows-x64")).toEqual(["native/p.exe"]);
		const sums = (await readFile(join(out, "SHA256SUMS"), "utf8")).trim().split("\n");
		expect(sums.map(line => line.split("  ")[1])).toEqual([
			"demo-1.0.0-linux-arm64.tar.gz",
			"demo-1.0.0-linux-x64.tar.gz",
			"demo-1.0.0-macos-arm64.tar.gz",
			"demo-1.0.0-macos-x64.tar.gz",
			"demo-1.0.0-windows-x64.tar.gz",
		]);
		const verify = Bun.spawnSync(["shasum", "-a", "256", "-c", "SHA256SUMS"], { cwd: out });
		expect(verify.exitCode).toBe(0);
	});

	test("land in an output folder named relative to where the release runs, as the workflow names it", async () => {
		const root = await tree(["omp"]);
		for (const b of ["macos-arm64/p", "macos-x64/p", "linux-arm64/p", "linux-x64/p", "p.exe", "p"])
			await put(root, `build/native/${b}`, `${b}\n`);
		await put(root, "out/.keep", "");
		const here = process.cwd();
		process.chdir(root);
		try {
			await pack(join(root, "build", "native"), { plugin: "demo", version: "1.0.0" }, ["p"], "out");
		} finally {
			process.chdir(here);
		}
		const verify = Bun.spawnSync(["shasum", "-a", "256", "-c", "SHA256SUMS"], { cwd: join(root, "out") });
		expect(verify.stdout.toString().trim().split("\n")).toHaveLength(5);
		expect(verify.exitCode).toBe(0);
	});

	test("checksums are sha256sum's lines", () => {
		expect(sha256sums(new Map([["a", new TextEncoder().encode("abc")]]))).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  a\n",
		);
	});
});
