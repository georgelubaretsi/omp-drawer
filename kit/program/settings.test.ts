import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDeclared } from "../core/declared";
import { serveLocalPage } from "./local-page";
import { settingsHandler } from "./settings";
import { type PagePlugin, withChoices } from "./settings-page";

const declared = parseDeclared(
	JSON.stringify({
		settings: {
			search: {
				type: "choice",
				title: "Search",
				about: "How much.",
				default: "first",
				choices: [
					{ value: "only", label: "Only", means: "Only this." },
					{ value: "first", label: "First", means: "This first." },
				],
			},
			folder: { type: "path", title: "Folder", about: "Where.", default: "" },
		},
		secrets: {},
	}),
);
const demo: PagePlugin = { name: "demo", declared };
const tmp = mkdtempSync(join(tmpdir(), "settings-page-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("the person's choices", () => {
	test("join their file, keeping other plugins and keys the page doesn't know", () => {
		const file = { other: { x: "1" }, demo: { kept: "yes", search: "only" } };
		expect(withChoices(file, demo, { folder: "docs/threads" })).toEqual({
			file: { other: { x: "1" }, demo: { kept: "yes", search: "only", folder: "docs/threads" } },
			problems: [],
		});
	});
	test("set to the default, leave the file, and an emptied section goes", () => {
		expect(withChoices({ demo: { search: "only" } }, demo, { search: "first" }).file).toEqual({});
		expect(withChoices({ demo: { search: "only", folder: "x" } }, demo, { folder: "" }).file).toEqual({
			demo: { search: "only" },
		});
	});
	test("that the declarations don't allow are problems", () => {
		expect(withChoices({}, demo, { search: "never", nope: "1" }).problems).toEqual([
			'Search can\'t be "never".',
			"demo has no setting nope.",
		]);
	});
});

const at = (name: string) => join(tmp, name);
const post = (path: string, body: unknown) =>
	settingsHandler([demo], path)(new Request("http://x/", { method: "POST", body: JSON.stringify(body) }));

describe("the page", () => {
	test("shows the person's own choice", async () => {
		writeFileSync(at("shown.json"), JSON.stringify({ demo: { search: "only" } }));
		const html = await (await settingsHandler([demo], at("shown.json"))(new Request("http://x/"))).text();
		expect(html).toContain('value="only" checked');
		expect(html).not.toContain('value="first" checked');
	});
	test("saves, creating the folder; a refused choice changes nothing", async () => {
		const path = join(tmp, "new/.agents/piebird/settings.json");
		expect((await post(path, { demo: { search: "only" } })).status).toBe(200);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ demo: { search: "only" } });
		const refused = await post(path, { demo: { search: "never", folder: "x" } });
		expect(refused.status).toBe(400);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ demo: { search: "only" } });
	});
	test("leaves a file that isn't JSON alone", async () => {
		writeFileSync(at("broken.json"), "{ not json");
		const res = await post(at("broken.json"), { demo: { search: "only" } });
		expect(res.status).toBe(400);
		expect(readFileSync(at("broken.json"), "utf8")).toBe("{ not json");
	});
	test("leaves a file it can't read alone", async () => {
		const file = at("locked.json");
		writeFileSync(file, '{"demo":{"search":"only"}}');
		chmodSync(file, 0o000);
		const res = await post(file, { demo: { search: "offered" } });
		chmodSync(file, 0o600);
		expect(res.status).toBe(400);
		expect(readFileSync(file, "utf8")).toBe('{"demo":{"search":"only"}}');
	});
});

describe("the local page", () => {
	test("answers only its own host and path, and is never cached", async () => {
		const page = serveLocalPage(() => new Response("hi"));
		try {
			const url = new URL(page.url);
			const ok = await fetch(page.url);
			expect([ok.status, ok.headers.get("cache-control")]).toEqual([200, "no-store"]);
			expect((await fetch(`${url.origin}/`)).status).toBe(404);
			const rebound = await fetch(page.url, { headers: { host: `attacker.example:${url.port}` } });
			expect(rebound.status).toBe(404);
		} finally {
			page.stop();
		}
	});
});
