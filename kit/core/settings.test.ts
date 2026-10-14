import { describe, expect, test } from "bun:test";
import { parseDeclared } from "./declared";
import type { Io } from "./io";
import { readSettings, resolveSettings, SETTINGS_PATH, SHARED, type Sources } from "./settings";

const about = { title: "A setting", about: "What it is for." };
const choice = (value: string) => ({ value, label: value, means: `It's ${value}.` });

const DECLARED = parseDeclared(
	JSON.stringify({
		settings: {
			mode: { type: "choice", ...about, default: "first", choices: ["first", "only", "offered"].map(choice) },
			greeting: { type: "text", ...about, default: "hello" },
			folder: { type: "path", ...about, default: ".threads" },
		},
		secrets: { token: { title: "Token", about: "Signs in." } },
	}),
);

function resolve(sources: Sources) {
	return resolveSettings("demo", DECLARED, sources);
}

function values(sources: Sources): Record<string, string> {
	return Object.fromEntries(Object.entries(resolve(sources).values).map(([k, r]) => [k, `${r.value} (${r.from})`]));
}

describe("each setting's value, by level", () => {
	test("the default when nothing is set", () => {
		expect(values({})).toEqual({
			mode: "first (default)",
			greeting: "hello (default)",
			folder: ".threads (default)",
		});
	});

	test("project over default, the person over the project, the agent's own over both", () => {
		const project = { demo: { mode: "only", greeting: "from the repo", folder: "notes" } };
		const user = { demo: { mode: "offered", greeting: "from me" } };
		expect(values({ project })).toEqual({
			mode: "only (project)",
			greeting: "from the repo (project)",
			folder: "notes (project)",
		});
		expect(values({ project, user })).toEqual({
			mode: "offered (user)",
			greeting: "from me (user)",
			folder: "notes (project)",
		});
		expect(values({ project, user, agent: { mode: "first" } })).toMatchObject({ mode: "first (agent)" });
	});

	test("an agent's shared choice, an empty text, or none, follows the files", () => {
		const user = { demo: { mode: "only", greeting: "from me" } };
		expect(values({ user, agent: { mode: SHARED, greeting: "" } })).toMatchObject({
			mode: "only (user)",
			greeting: "from me (user)",
		});
		expect(values({ user, agent: { mode: undefined } })).toMatchObject({ mode: "only (user)" });
	});

	test("other plugins' sections are not this plugin's", () => {
		expect(values({ user: { other: { mode: "only" } } })).toMatchObject({ mode: "first (default)" });
		expect(resolve({ user: { other: { mode: "only" } } }).problems).toEqual([]);
	});
});

describe("a value that doesn't apply is reported and skipped", () => {
	test("a secret, an undeclared key, a non-string, a value not among the choices", () => {
		const project = { demo: { token: "s3cret", colour: "red", greeting: 3, mode: "never" } };
		const result = resolve({ project });
		expect(result.problems).toEqual([
			{ level: "project", key: "token", issue: "secret" },
			{ level: "project", key: "colour", issue: "unknown" },
			{ level: "project", key: "greeting", issue: "not-a-string" },
			{ level: "project", key: "mode", issue: "not-a-choice" },
		]);
		expect(values({ project })).toEqual({
			mode: "first (default)",
			greeting: "hello (default)",
			folder: ".threads (default)",
		});
	});

	test("a skipped value lets the level below apply", () => {
		const project = { demo: { mode: "only" } };
		expect(values({ project, user: { demo: { mode: "never" } } })).toMatchObject({ mode: "only (project)" });
		expect(values({ project, agent: { mode: "never" } })).toMatchObject({ mode: "only (project)" });
		expect(resolve({ project, agent: { mode: "never" } }).problems).toEqual([
			{ level: "agent", key: "mode", issue: "not-a-choice" },
		]);
	});

	test("a plugin section, or a whole file, that isn't an object", () => {
		expect(resolve({ project: { demo: ["only"] }, user: "mode=only" }).problems).toEqual([
			{ level: "project", key: "", issue: "not-an-object" },
			{ level: "user", key: "", issue: "not-an-object" },
		]);
	});
});

function io(files: Record<string, string>, read: string[]): Io {
	return {
		readText: async path => {
			read.push(path);
			return files[path];
		},
		readPieces: async () => undefined,
		list: async () => undefined,
		run: async () => {
			throw new Error("no runs");
		},
	};
}

describe("readSettings", () => {
	test("reads the project's file and the person's, the person's winning", async () => {
		const read: string[] = [];
		const files = {
			[`/p/${SETTINGS_PATH}`]: JSON.stringify({ demo: { mode: "only", greeting: "repo" } }),
			[`/h/${SETTINGS_PATH}`]: JSON.stringify({ demo: { mode: "offered" } }),
		};
		const got = await readSettings(
			io(files, read),
			{ home: "/h", project: "/p", plugin: "/x" },
			{ plugin: "demo", declared: DECLARED },
		);
		expect(read.toSorted()).toEqual([`/h/${SETTINGS_PATH}`, `/p/${SETTINGS_PATH}`]);
		expect(got.values.mode).toEqual({ value: "offered", from: "user" });
		expect(got.values.greeting).toEqual({ value: "repo", from: "project" });
		expect(got.problems).toEqual([]);
	});

	test("working in the home folder reads the one file, as the person's", async () => {
		const read: string[] = [];
		const files = { [`/h/${SETTINGS_PATH}`]: JSON.stringify({ demo: { mode: "only" } }) };
		const got = await readSettings(
			io(files, read),
			{ home: "/h", project: "/h", plugin: "/x" },
			{ plugin: "demo", declared: DECLARED },
		);
		expect(read).toEqual([`/h/${SETTINGS_PATH}`]);
		expect(got.values.mode).toEqual({ value: "only", from: "user" });
	});

	test("a file that isn't JSON is a problem and skipped", async () => {
		const files = {
			[`/p/${SETTINGS_PATH}`]: "{ not json",
			[`/h/${SETTINGS_PATH}`]: JSON.stringify({ demo: { greeting: "mine" } }),
		};
		const got = await readSettings(
			io(files, []),
			{ home: "/h", project: "/p", plugin: "/x" },
			{ plugin: "demo", declared: DECLARED },
		);
		expect(got.problems).toEqual([{ level: "project", key: "", issue: "not-json" }]);
		expect(got.values.mode).toEqual({ value: "first", from: "default" });
		expect(got.values.greeting).toEqual({ value: "mine", from: "user" });
	});
});
