// piebird-sessions: the user worked on the project in Claude Code and in Codex too. From omp, the
// same tool reads their sessions: what was decided in each.
import type { Scenario } from "../../../tools/demo/record";
import { join } from "node:path";
import { writeProject } from "../../../tools/demo/project";
import { intro, outro, writeJournal } from "../../feature";
import { shopApi } from "../../shop-api";

const CLAUDE_ID = "0c1a0de0-1111-4222-8333-444455556666";
const CODEX_ID = "019f0000-1111-7222-8333-444455556666";

/** A Claude Code session where the user settled how refunds work. */
function claudeJournal(project: string): unknown[] {
	const line = (role: string, content: string, minute: number) => ({
		type: role,
		sessionId: CLAUDE_ID,
		cwd: project,
		timestamp: `2026-10-12T09:0${minute}:00.000Z`,
		message: { role, content },
	});
	return [
		line("user", "Refunds: refund the gift card first, then the card, and never more than was paid.", 1),
		line("assistant", "Noted: gift card first, then the card, capped at what was paid.", 2),
	];
}

/** A Codex event's time, `second` seconds into the session. */
const codexAt = (second: number) => `2026-10-12T10:00:0${second}.000Z`;

/** A Codex session where the user settled the order number format. */
function codexJournal(project: string): unknown[] {
	return [
		{ type: "session_meta", timestamp: codexAt(0), payload: { id: CODEX_ID, cwd: project } },
		{
			type: "event_msg",
			timestamp: codexAt(1),
			payload: { type: "user_message", message: "Order numbers: SHOP- then the year, then a six-digit counter." },
		},
		{
			type: "event_msg",
			timestamp: codexAt(2),
			payload: { type: "agent_message", message: "Noted: SHOP-2026-000123 style order numbers." },
		},
	];
}

export default {
	plugins: ["piebird-sessions"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		const claudeFolder = join(s.home, ".claude", "projects", s.project.replace(/[^a-zA-Z0-9]/g, "-"));
		await writeJournal(join(claudeFolder, `${CLAUDE_ID}.jsonl`), claudeJournal(s.project));
		const codexFile = join(
			s.home,
			".codex",
			"sessions",
			"2026",
			"10",
			"12",
			`rollout-2026-10-12T10-00-00-${CODEX_ID}.jsonl`,
		);
		await writeJournal(codexFile, codexJournal(s.project));
	},
	async run(d) {
		await intro(d, "piebird-sessions", "Claude Code's and Codex's sessions too");
		await d.prompt("I worked on this project in Claude Code and in Codex. What did I decide in each?");
		d.caption("Read from Claude Code's and Codex's journals", "from omp, with the same tool");
		await d.wait(5000);
		await outro(d, "piebird-sessions");
	},
} satisfies Scenario;
