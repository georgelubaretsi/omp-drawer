// The program's parts for Codex: the instructions, and the web.run hook following the "search"
// setting, with the marks the MCP server leaves when Kagi fails in a session.
import type { Io } from "../kit/core/io";
import type { Parts } from "../kit/program/cli";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { model } from "../core/model.gen";
import { instructions } from "../core/search";
import { failureMarks } from "../program/marks";
import { kagiParts } from "../program/parts";
import { goldenIo } from "./golden";

const folder = mkdtempSync(join(tmpdir(), "kagi-marks-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));
let made = 0;

const MINUTE = 60_000;
const HOME = "/home/ada";

/** The parts with `io`, a fresh marks folder, and a clock the test moves. */
async function program(io: Io, agent: Readonly<Record<string, string>> = {}) {
	const clock = { now: Date.parse("2026-10-14T09:00:00Z") };
	const marks = failureMarks(join(folder, String(made++)), () => clock.now);
	const place = { home: HOME, project: "/plugin", plugin: "/plugin" };
	const parts = await kagiParts(agent, { io, place, windows: false, marks });
	return { parts, clock };
}

/** A query the vault answers with sign-in-needed: no session is kept (golden.ts). */
const NO_SESSION = "rust async runtime";

/** Performs a search as the MCP server does: the handler, then afterCall with the call's _meta. */
async function search(parts: Parts, meta: Readonly<Record<string, unknown>>, query = "go http client timeout") {
	const handler = parts.handlers.search;
	if (handler === undefined) throw new Error("no search handler");
	const outcome = await handler({ query });
	await parts.afterCall?.({ operation: "search", outcome, meta });
}

function webRun(session: string, input: object = { search_query: [{ q: "bun ffi" }] }) {
	return { sessionId: session, cwd: "/work", hookEventName: "PreToolUse", toolName: "webrun", toolInput: input };
}

async function hook(parts: Parts, event: ReturnType<typeof webRun>) {
	if (parts.hook === undefined) throw new Error("no hook");
	return parts.hook(event);
}

const ALLOWED = { stdout: "", exitCode: 0 };
const refused = (choice: string) => ({
	stdout: `${JSON.stringify({
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: model.text("refused-web-run", { search: choice }).text,
		},
	})}\n`,
	exitCode: 0,
});

describe("Kagi first", () => {
	test("web.run doesn't search; it opens pages", async () => {
		const { parts } = await program(goldenIo());
		expect(await hook(parts, webRun("s-1"))).toEqual(refused("first"));
		expect(await hook(parts, webRun("s-1", { open: [{ ref_id: "https://bun.sh" }] }))).toEqual(ALLOWED);
		expect(parts.instructions?.text).toBe(instructions("first").text);
	});

	test("once Kagi fails in a session, web.run searches there, and only there", async () => {
		const { parts } = await program(goldenIo());
		await search(parts, { sessionId: "s-1" }, NO_SESSION);
		expect(await hook(parts, webRun("s-1"))).toEqual(ALLOWED);
		expect(await hook(parts, webRun("s-2"))).toEqual(refused("first"));
	});

	test("a failure from a call without a session counts for every session, for ten minutes", async () => {
		const { parts, clock } = await program(goldenIo());
		await search(parts, {}, NO_SESSION);
		expect(await hook(parts, webRun("s-2"))).toEqual(ALLOWED);
		clock.now += 11 * MINUTE;
		expect(await hook(parts, webRun("s-2"))).toEqual(refused("first"));
	});

	test("a search that works leaves no mark", async () => {
		const { parts } = await program(goldenIo());
		await search(parts, { sessionId: "s-1" });
		expect(await hook(parts, webRun("s-1"))).toEqual(refused("first"));
	});
});

describe("the other choices", () => {
	test("Kagi only refuses web.run searches even after Kagi fails", async () => {
		const { parts } = await program(goldenIo(), { search: "only" });
		await search(parts, { sessionId: "s-1" }, NO_SESSION);
		expect(await hook(parts, webRun("s-1"))).toEqual(refused("only"));
	});

	test("Kagi offered, the project's choice in the session's folder, lets web.run search", async () => {
		const files = {
			"/work/.agents/piebird/settings.json": JSON.stringify({ "piebird-kagi-search": { search: "offered" } }),
		};
		const { parts } = await program(goldenIo({ files }));
		expect(await hook(parts, webRun("s-1"))).toEqual(ALLOWED);
	});
});
