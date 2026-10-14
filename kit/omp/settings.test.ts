// omp's own choices for a plugin's settings: the person's lock file and the project's overrides,
// each read apart, and files of the wrong shape counting as no choices.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ompChoices, ompChoicesFrom } from "./settings";

const PLUGIN = "piebird-demo";

const file = (settings: unknown) => JSON.stringify({ plugins: {}, settings });

describe("ompChoicesFrom", () => {
	test("keeps the person's choices and the project's apart, for the project's to rank below the person", () => {
		const choices = ompChoicesFrom(PLUGIN, {
			user: file({ [PLUGIN]: { search: "only", region: "us" } }),
			project: file({ [PLUGIN]: { search: "first", safe: "strict" } }),
		});
		expect(choices).toEqual({
			person: { search: "only", region: "us" },
			project: { search: "first", safe: "strict" },
		});
	});

	test("reads only this plugin's section", () => {
		const choices = ompChoicesFrom(PLUGIN, { user: file({ other: { search: "only" }, [PLUGIN]: { region: "us" } }) });
		expect(choices).toEqual({ person: { region: "us" }, project: {} });
	});

	test("has no choices without files", () => {
		expect(ompChoicesFrom(PLUGIN, {})).toEqual({ person: {}, project: {} });
	});

	test("skips values that aren't text", () => {
		const choices = ompChoicesFrom(PLUGIN, {
			user: file({ [PLUGIN]: { search: "only", count: 3, on: true, list: ["a"] } }),
		});
		expect(choices).toEqual({ person: { search: "only" }, project: {} });
	});

	test("a malformed file counts as no choices, leaving the other one", () => {
		const user = file({ [PLUGIN]: { search: "only" } });
		for (const project of [
			"{not json",
			"[]",
			"null",
			file("text"),
			file([]),
			file({ [PLUGIN]: "first" }),
			file({ [PLUGIN]: [] }),
		]) {
			expect(ompChoicesFrom(PLUGIN, { user, project })).toEqual({ person: { search: "only" }, project: {} });
		}
	});
});

describe("ompChoices", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true })));
	});

	test("reads the project's .omp/plugin-overrides.json", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "kit-omp-settings-"));
		roots.push(cwd);
		// A name no one's lock file holds, so the person's real file adds nothing.
		const plugin = `kit-omp-test-${crypto.randomUUID()}`;
		await mkdir(join(cwd, ".omp"));
		await writeFile(join(cwd, ".omp", "plugin-overrides.json"), file({ [plugin]: { search: "first" } }));
		expect(ompChoices(plugin, cwd).project).toEqual({ search: "first" });
	});

	test("has no choices for a project without overrides", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "kit-omp-settings-"));
		roots.push(cwd);
		expect(ompChoices(`kit-omp-test-${crypto.randomUUID()}`, cwd)).toEqual({ person: {}, project: {} });
	});
});
