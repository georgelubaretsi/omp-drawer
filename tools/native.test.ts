import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlugin, catalogEntries, foreignLibraries, starter, TARGETS } from "./native";

describe("the starter script", () => {
	test("runs this system's build with the arguments it was given", async () => {
		const dir = await mkdtemp(join(tmpdir(), "native-"));
		const platform = `${process.platform === "darwin" ? "macos" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
		await mkdir(join(dir, platform));
		await writeFile(join(dir, platform, "demo"), '#!/bin/sh\necho "build ran: $*"\n');
		await chmod(join(dir, platform, "demo"), 0o755);
		await writeFile(join(dir, "demo"), starter("demo"));
		await chmod(join(dir, "demo"), 0o755);
		const child = Bun.spawn([join(dir, "demo"), "a b", "c"], { stdout: "pipe" });
		expect(await new Response(child.stdout).text()).toBe("build ran: a b c\n");
		expect(await child.exited).toBe(0);
	});
});

describe("a release build's libraries", () => {
	test("are the system's own; a Bun from Nix links its ICU", () => {
		const official = `x:
	/usr/lib/libicucore.A.dylib (compatibility version 1.0.0, current version 78.1.0)
	/System/Library/Frameworks/Security.framework/Versions/A/Security (compatibility version 1.0.0)
	/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1356.0.0)
`;
		const nix = official.replace("/usr/lib/libicucore", "/nix/store/2v1n-ICU-76142.4.7/lib/libicucore");
		expect(foreignLibraries(official)).toEqual([]);
		expect(foreignLibraries(nix)).toEqual(["/nix/store/2v1n-ICU-76142.4.7/lib/libicucore.A.dylib"]);
	});
});

describe("builds", () => {
	test(
		"are the same bytes every time, for every platform",
		async () => {
			const out = await mkdtemp(join(tmpdir(), "native-"));
			const program = (await catalogEntries()).get("piebird-kagi-search")?.program;
			if (!program) throw new Error("catalog.json names no program for piebird-kagi-search");
			const kagi = { name: "piebird-kagi-search", program, bun: false };
			await buildPlugin(kagi, join(out, "a"));
			await buildPlugin(kagi, join(out, "b"));
			for (const t of TARGETS) {
				const path = t.path(program);
				const [a, b] = await Promise.all([readFile(join(out, "a", path)), readFile(join(out, "b", path))]);
				expect(a.length).toBeGreaterThan(1_000_000);
				expect(Buffer.compare(a, b)).toBe(0);
			}
		},
		{ timeout: 300_000 },
	);
});
