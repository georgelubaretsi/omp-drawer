import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { CHANGELOG, cleanup, problems, put, tree } from "./fixtures";

afterEach(cleanup);

const C = "plugins/demo/CHANGELOG.md";
const release = (version: string) => `${CHANGELOG}\n## [${version}] - 2026-01-01\n\n### Added\n\n- First.\n`;

describe("plugin changelog", () => {
	test("empty Unreleased, no release: any version", async () => {
		expect(await problems(await tree(["omp"]))).toEqual([]);
	});

	test("newest release equals plugin.json's version", async () => {
		const root = await tree(["omp"]);
		await put(root, C, release("1.0.0"));
		expect(await problems(root)).toEqual([]);
	});

	test("newest release differs from plugin.json's version", async () => {
		const root = await tree(["omp"]);
		await put(root, C, release("0.9.0"));
		expect(await problems(root)).toEqual([`${C}: the newest release is 0.9.0, but plugin.json has version 1.0.0`]);
	});

	test("missing", async () => {
		const root = await tree(["omp"]);
		await rm(join(root, C));
		expect(await problems(root)).toEqual([
			`${C}: missing; every plugin keeps one (Keep a Changelog 2.0.0, with ## [Unreleased])`,
		]);
	});

	test("named in another case", async () => {
		const root = await tree(["omp"]);
		await rename(join(root, C), join(root, "plugins/demo/changelog.md"));
		expect(await problems(root)).toEqual([
			"plugins/demo/changelog.md: must be named exactly CHANGELOG.md; case-sensitive filesystems won't find it",
			`${C}: missing; every plugin keeps one (Keep a Changelog 2.0.0, with ## [Unreleased])`,
		]);
	});

	test("a folder", async () => {
		const root = await tree(["omp"]);
		await rm(join(root, C));
		await mkdir(join(root, C));
		expect(await problems(root)).toEqual([`${C}: must be a regular file`]);
	});

	test("doesn't parse, or has no Unreleased section", async () => {
		const root = await tree(["omp"]);
		await put(root, C, "# Changelog\n\n## [1.0.0] - 2026-01-01\n");
		expect(await problems(root)).toEqual([
			`${C}: has no "## [Unreleased]" section; add one above the releases (it may be empty)`,
		]);
		await put(root, C, "# Changelog\n\n## Next\n\n- a\n");
		expect(await problems(root)).toEqual([
			`${C}: not in Keep a Changelog format: Parse error in the line 5: Syntax error in the release title`,
		]);
	});
});
