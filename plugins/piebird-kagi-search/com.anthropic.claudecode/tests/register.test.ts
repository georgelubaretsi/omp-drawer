// The mod in Claude Code's engine, run by `claude plugin test .` on a copy of the plugin without its
// Bun tests (test/claude.test.ts). Each test loads the mod afresh; the hooks a test registers with
// `on` sit beneath it and answer in Claude Code's place: the person's settings file, the vault and
// Claude Code's own tools.
import type { On } from "claude-code";
import { describe, expect, test } from "claude-code/testing";
import { model } from "../../core/model.gen";

const HOME = "/home/ada";
const SEARCH = "mcp__piebird-kagi-search__kagi_search";
const WEB = { tool: "WebSearch", query: "bun 2" };
const DESCRIBE = { tool: "WebSearch", description: "Searches the web", provider: { plugin: "engine", tier: "core" } };
const BEHIND = { description: "Searches the web", isDeferred: true };
const IN_FRONT = { description: "Searches the web" };
const FOUND = { output: { results: [{ title: "Bun 2", url: "https://bun.sh/", date: "2026-10-01" }] } };
const DOWN = { error: { id: "cannot-reach", variables: { cause: "no network" } } };

interface Setup {
	/** The person's choice in ~/.agents/piebird/settings.json; none: the default, first. */
	readonly search?: string;
	/** The vault's reply to every call; none: the plugin has no vault built. */
	readonly vault?: object;
}

/** Claude Code beneath the mod. Returns what ran, in order: vault operations and Claude Code's tools. */
function engine(on: On, { search, vault }: Setup): string[] {
	const ran: string[] = [];
	on("env.get", ($, e) => ({ value: e.name === "HOME" ? HOME : undefined }));
	on("session.root", () => ({ value: "/work" }));
	on("fs.read", ($, e) => {
		if (search !== undefined && e.path === `${HOME}/.agents/piebird/settings.json`)
			return { value: JSON.stringify({ "piebird-kagi-search": { search } }) };
		throw new Error(`fs.read ${e.path} failed: ENOENT`);
	});
	on("fs.exists", ($, e) => ({ value: vault !== undefined && e.path.endsWith("/native/kagi-vault") }));
	on("process.run", ($, e) => {
		ran.push(`vault ${e.argv.slice(1).join(" ")}`);
		const stdout = JSON.stringify(vault);
		return { value: { exitCode: 0, stdout, stderr: "", isStdoutTruncated: false, isStderrTruncated: false } };
	});
	on("tool.call", ($, e) => {
		ran.push(e.tool);
		return { result: "ok" };
	});
	on("tool.describe", ($, e) => ({ description: e.description }));
	on("prompt.context", ($, e) => ({ blocks: e.blocks }));
	return ran;
}

const refusal = (search: string) => ({ deny: model.text("refused-web-search", { search }).text });

describe("Kagi first", () => {
	test("Kagi searches through the vault; WebSearch waits behind tool search and is refused", async ($, on) => {
		const ran = engine(on, { vault: FOUND });
		expect(await $.tool.describe(DESCRIBE)).toEqual(BEHIND);
		expect(await $.tool.call(WEB)).toEqual(refusal("first"));
		expect(await $.tool.call({ tool: SEARCH, query: "bun 2" })).toEqual({
			result: "1. [Bun 2](https://bun.sh/) · 2026-10-01",
		});
		expect(ran).toEqual(["vault call search"]);
	});

	test("once Kagi can't be reached, WebSearch is back in front and runs", async ($, on) => {
		const ran = engine(on, { vault: DOWN });
		expect(await $.tool.call({ tool: SEARCH, query: "bun 2" })).toEqual({
			deny: model.text("error-cannot-reach", { cause: "no network" }).text,
		});
		expect(await $.tool.describe(DESCRIBE)).toEqual(IN_FRONT);
		expect(await $.tool.call(WEB)).toEqual({ result: "ok" });
		expect(ran).toEqual(["vault call search", "WebSearch"]);
	});

	test("a call the model got wrong isn't Kagi failing", async ($, on) => {
		engine(on, { vault: FOUND });
		await $.tool.call({ tool: SEARCH, query: "bun 2", format: "xml" });
		expect(await $.tool.call(WEB)).toEqual(refusal("first"));
	});

	test("without a vault built, WebSearch is in front and runs", async ($, on) => {
		const ran = engine(on, {});
		expect(await $.tool.describe(DESCRIBE)).toEqual(IN_FRONT);
		expect(await $.tool.call(WEB)).toEqual({ result: "ok" });
		expect(ran).toEqual(["WebSearch"]);
	});

	test("the model is told to search with Kagi first", async ($, on) => {
		engine(on, { vault: FOUND });
		expect(await $.prompt.context({ blocks: [] })).toEqual({
			blocks: [{ name: "piebird-kagi-search", text: model.text("instructions", { search: "first" }).text }],
		});
	});

	test("after /clear, the next conversation starts without the last one's Kagi failure", async ($, on) => {
		engine(on, { vault: DOWN });
		on("session.end", () => ({ sessionId: "s1" }));
		await $.tool.call({ tool: SEARCH, query: "bun 2" });
		expect(await $.tool.describe(DESCRIBE)).toEqual(IN_FRONT);
		await $.session.end({ reason: "clear" });
		expect(await $.tool.describe(DESCRIBE)).toEqual(BEHIND);
	});
});

describe("Kagi only, from the person's settings file", () => {
	test("WebSearch stays behind tool search and refused, even after Kagi fails", async ($, on) => {
		const ran = engine(on, { search: "only", vault: DOWN });
		await $.tool.call({ tool: SEARCH, query: "bun 2" });
		expect(await $.tool.describe(DESCRIBE)).toEqual(BEHIND);
		expect(await $.tool.call(WEB)).toEqual(refusal("only"));
		expect(ran).toEqual(["vault call search"]);
	});
});

describe("Kagi offered", () => {
	test("WebSearch is left alone", async ($, on) => {
		const ran = engine(on, { search: "offered", vault: FOUND });
		expect(await $.tool.describe(DESCRIBE)).toEqual(IN_FRONT);
		expect(await $.tool.call(WEB)).toEqual({ result: "ok" });
		expect(ran).toEqual(["WebSearch"]);
	});
});
