import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LIST_LIMIT } from "../core/list";
import { rootsOf } from "../core/lookup";
import { readSession } from "../core/read";
import { bunIo } from "../kit/bun/io";
import { failure, message, Sessions } from "./fixtures";

let sessions: Sessions;
afterEach(() => sessions.cleanup());

const id = (prefix: string) => `${prefix}-bbbb-cccc-dddd-eeeeeeeeeeee`;
const stamp = (minute: number) => `2026-09-02T10-${String(minute).padStart(2, "0")}-00-000Z`;

describe("session_read without a session", () => {
	test("lists the project's sessions newest first, marks this one, and offers the newest other", async () => {
		sessions = new Sessions();
		const long = `Use Redis for the cart cache, 60 seconds, ${"and never for logged-in users ".repeat(4)}`;
		sessions.write("01a0aaaa", [{ type: "title", title: "Cart cache" }, message(1, "user", long)], stamp(1));
		sessions.write("01a0bbbb", [message(1, "user", [{ type: "text", text: "round the\n  totals" }])], stamp(2));
		const current = path.join(sessions.folder, `${stamp(3)}_${id("01a0cccc")}.jsonl`);
		sessions.write("01a0cccc", [message(1, "assistant", [{ type: "text", text: "no prompt yet" }])], stamp(3));

		const lines = await sessions.read({}, current);

		expect(lines[0]).toBe(`Sessions in ${sessions.folder}, newest first:`);
		expect(lines[1]).toBe(`- ${id("01a0cccc")} · 2026-09-02T10:03:00.000Z · this session`);
		expect(lines[2]).toBe(`- ${id("01a0bbbb")} · 2026-09-02T10:02:00.000Z · first prompt: round the totals`);
		expect(lines[3]).toBe(
			`- ${id("01a0aaaa")} · 2026-09-02T10:01:00.000Z · Cart cache · first prompt: ${long.slice(0, 100)}…`,
		);
		expect(lines[4]).toBe(`read one: session_read {"session":"${id("01a0bbbb")}","user":true,"after":20}`);
	});

	test("shows the newest sessions up to the limit and counts the older ones", async () => {
		sessions = new Sessions();
		for (let minute = 0; minute <= LIST_LIMIT; minute++)
			sessions.write(
				`01a0${String(minute).padStart(4, "0")}`,
				[message(1, "user", `prompt ${minute}`)],
				stamp(minute),
			);

		const lines = await sessions.read({});

		expect(lines[0]).toBe(
			`Sessions in ${sessions.folder}, newest first (${LIST_LIMIT} of ${LIST_LIMIT + 1}; list the folder for older ones):`,
		);
		expect(lines.filter(line => line.startsWith("- "))).toHaveLength(LIST_LIMIT);
		expect(lines.some(line => line.endsWith("first prompt: prompt 0"))).toBe(false);
		expect(lines.at(-1)).toBe(
			`read one: session_read {"session":"${id(`01a0${String(LIST_LIMIT).padStart(4, "0")}`)}","user":true,"after":20}`,
		);
	});

	test("says when the folder holds no sessions, and refuses parameters other than find", async () => {
		sessions = new Sessions();
		expect(await sessions.read({})).toEqual([`No sessions in ${sessions.folder}.`]);
		expect(await failure(sessions.read({ user: true }))).toContain("give a session");
	});

	test("with find, lists the sessions to search, after how to search one", async () => {
		sessions = new Sessions();
		sessions.write("01a0aaaa", [message(1, "user", "cache the products")], stamp(1));

		const lines = await sessions.read({ find: "products cache" });

		expect(lines[0]).toContain('find "products cache"');
		expect(lines[1]).toBe(`Sessions in ${sessions.folder}, newest first:`);
		expect(lines[2]).toStartWith(`- ${id("01a0aaaa")} `);
	});
});

/** A journal of `lines`, last written `minute` minutes past ten. */
function journal(file: string, lines: unknown[], minute: number): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${lines.map(l => JSON.stringify(l)).join("\n")}\n`);
	const when = new Date(Date.UTC(2026, 9, 12, 10, minute));
	fs.utimesSync(file, when, when);
}

describe("session_read without a session, where the project isn't known", () => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "sessions-every-agent-"));
	afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
	const roots = rootsOf(home, {});

	test("lists every agent's sessions by when each was last written, with the agent and the project", async () => {
		const ompId = "01a0aaaa-0000-7000-8000-000000000001";
		const claudeId = "0b1b0000-1111-4222-8333-444455556666";
		const codexId = "019f0000-2222-7333-8444-555566667777";
		journal(
			`${roots.omp}/-home-ada-shop/2026-10-12T09-00-00-000Z_${ompId}.jsonl`,
			[
				{ type: "session", id: ompId, cwd: `${home}/shop`, timestamp: "2026-10-12T09:00:00.000Z" },
				{ type: "title", title: "Cart cache" },
				message(1, "user", "Add a cart cache"),
			],
			1,
		);
		const claudeLine = { sessionId: claudeId, cwd: "/srv/api", timestamp: "2026-10-12T09:30:00.000Z" };
		journal(
			`${roots.claude}/-srv-api/${claudeId}.jsonl`,
			[{ ...claudeLine, type: "user", message: { role: "user", content: "Fix the totals" } }],
			3,
		);
		// A session's subagent keeps its own journal under the session's folder: not a session.
		journal(
			`${roots.claude}/-srv-api/${claudeId}/subagents/agent-a1b2.jsonl`,
			[{ ...claudeLine, type: "user", message: { role: "user", content: "subagent work" } }],
			5,
		);
		journal(
			`${roots.codex}/2026/10/12/rollout-2026-10-12T09-45-00-${codexId}.jsonl`,
			[
				{
					type: "session_meta",
					timestamp: "2026-10-12T09:45:00.000Z",
					payload: { id: codexId, cwd: `${home}/notes` },
				},
				{
					type: "event_msg",
					timestamp: "2026-10-12T09:45:01.000Z",
					payload: { type: "user_message", message: "Sum up my notes" },
				},
			],
			2,
		);

		const text = await readSession(bunIo(), {}, { roots: [], list: { kind: "all", roots }, home });

		expect(text.text.split("\n")).toEqual([
			"Sessions of every agent and project, newest first:",
			`- ${claudeId} · 2026-10-12T09:30:00.000Z · Claude Code · in /srv/api · first prompt: Fix the totals`,
			`- ${codexId} · 2026-10-12T09:45:01.000Z · Codex · in ~/notes · first prompt: Sum up my notes`,
			`- ${ompId} · 2026-10-12T09:00:00.000Z · omp · in ~/shop · Cart cache · first prompt: Add a cart cache`,
			`read one: session_read {"session":"${claudeId}","user":true,"after":20}`,
		]);
	});

	test("says where it looked when no agent has a session", async () => {
		const text = await readSession(bunIo(), {}, { roots: [], list: { kind: "all", roots }, home });
		expect(text.text).toBe("No sessions in ~/.omp/agent/sessions or ~/.claude/projects or ~/.codex/sessions.");
	});
});
