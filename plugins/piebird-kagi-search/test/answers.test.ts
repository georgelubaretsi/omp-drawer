// What the model reads for the vault's replies at their edges, and when the vault itself fails.
import type { Io, RunResult } from "../kit/core/io";
import type { Outcome } from "../kit/core/operations";
import { describe, expect, test } from "bun:test";
import { handlersFor } from "../core/handlers";

/** How the vault runs: what it prints and how it exits, or how it fails to start. */
type Vault = () => Promise<RunResult>;

/** A vault that answers every call with `reply`. */
const replying =
	(reply: object): Vault =>
	async () => ({ exitCode: 0, stdout: JSON.stringify(reply), stderr: "" });

/** An Io whose vault runs as `vault` says; it records the calls. */
function vaultIo(vault: Vault): Io & { readonly calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		readText: async () => undefined,
		readPieces: async () => undefined,
		list: async () => undefined,
		async run(argv) {
			calls.push(argv.slice(1).join(" "));
			return vault();
		},
	};
}

async function call(operation: string, input: object, vault: Vault): Promise<Outcome> {
	const handler = handlersFor(vaultIo(vault), "/plugin/native/kagi-vault")[operation];
	if (handler === undefined) throw new Error(`no handler for ${operation}`);
	return handler(input);
}

const text = async (operation: string, output: object) => (await call(operation, {}, replying({ output }))).text.text;

describe("lists", () => {
	test("a title can't close its link; blank details and Kagi's placeholder author are left out", async () => {
		const posts = [
			{ title: "A [draft] post", url: "https://a.example/", author: "Unknown author", published: "2026-10-01" },
			{ title: "Notes", url: "https://b.example/", author: "Bo", published: "" },
		];
		expect(await text("smallweb", { posts })).toBe(
			"1. [A \\[draft\\] post](https://a.example/) · 2026-10-01\n2. [Notes](https://b.example/) · Bo",
		);
	});

	test("an empty list says so", async () => {
		expect(await text("search", { results: [] })).toBe("No results.");
		expect(await text("news", { stories: [] })).toBe("No stories.");
		expect(await text("smallweb", { posts: [] })).toBe("No posts.");
	});

	test("a story reads without citation markers, with its first three sources", async () => {
		const articles = ["a.com", "b.org", "c.net", "d.io"].map(domain => ({ domain, link: `https://${domain}/x` }));
		const stories = [
			{ title: "Rain", emoji: "🌧", short_summary: "Rain fell [a.com#1]. Then sun[b.org#2].", articles },
		];
		expect(await text("news", { stories })).toBe(
			[
				"### 🌧 Rain",
				"Rain fell. Then sun.",
				"Sources: [a.com](https://a.com/x), [b.org](https://b.org/x), [c.net](https://c.net/x)",
			].join("\n"),
		);
	});
});

describe("raw responses", () => {
	test("say where a redirect points and that the body was cut", async () => {
		const response = {
			url: "https://kagi.com/x",
			status: 302,
			content_type: "text/html",
			location: "/signin",
			body: "",
			truncated: true,
		};
		expect(await text("raw-read", response)).toBe("HTTP 302 text/html → /signin (the first 4 MB of the body)");
	});

	test("a body saved to a file says where, and how it starts in a fence longer than its backticks", async () => {
		const saved = { path: "/cache/a1.html", type: "text/html", bytes: 81_920, preview: "```js\nx\n```" };
		const said = await text("raw-read", {
			url: "https://kagi.com/",
			status: 200,
			content_type: "text/html",
			body: "",
			saved,
		});
		expect(said).toContain(
			"The body is 80 KB, too long to send whole, so it is saved in /cache/a1.html (text/html).",
		);
		expect(said).toEndWith("It starts:\n\n````\n```js\nx\n```\n````");
	});
});

describe("format", () => {
	test("json gives the data as it came", async () => {
		const outcome = await call("search", { query: "x", format: "json" }, replying({ output: { results: [] } }));
		expect(outcome.text.text).toBe('{"results":[]}');
	});

	test("another form is refused before the vault is asked", async () => {
		const io = vaultIo(replying({ output: {} }));
		const outcome = await handlersFor(io, "/v").search({ query: "x", format: "xml" });
		expect(outcome).toMatchObject({ ok: false, error: "one-of" });
		expect(outcome.text.text).toBe('format is one of markdown, json, not "xml"');
		expect(io.calls).toEqual([]);
	});

	test("the vault never sees it", async () => {
		const io = vaultIo(replying({ output: { results: [] } }));
		await handlersFor(io, "/v").search({ query: "x", format: "markdown" });
		expect(io.calls).toEqual(["call search"]);
	});
});

describe("when the vault fails", () => {
	test("a vault that exits with an error, or can't be started, is the error vault", async () => {
		const exited = await call("quick", { query: "x" }, async () => ({ exitCode: 1, stdout: "", stderr: "boom" }));
		expect(exited).toMatchObject({ ok: false, error: "vault" });
		expect(exited.text.text).toContain("didn't answer: the vault exited 1: boom");
		const missing = await call("quick", { query: "x" }, async () => {
			throw new Error("spawn ENOENT");
		});
		expect(missing).toMatchObject({ ok: false, error: "vault" });
		expect(missing.text.text).toContain("spawn ENOENT");
	});

	test("an error the catalog doesn't know reads as the vault failing, with what it sent", async () => {
		const outcome = await call("search", { query: "x" }, replying({ error: { id: "martian", variables: { x: 1 } } }));
		expect(outcome).toMatchObject({ ok: false, error: "martian" });
		expect(outcome.text.text).toBe('the plugin\'s vault failed: martian {"x":1}');
	});
});
