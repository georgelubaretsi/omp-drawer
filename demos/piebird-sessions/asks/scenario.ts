// piebird-sessions: in an earlier session omp asked two questions before adding a cache, and the
// user picked one option and typed the other answer. A new session finds the question, its
// options and what was picked or typed; then the user's own words only.
import type { Scenario } from "../../../tools/demo/record";
import { join } from "node:path";
import { writeProject } from "../../../tools/demo/project";
import { omp } from "../../../tools/demo/sandbox";
import { SAMPLE_ID, sampleJournal } from "../../../plugins/piebird-sessions/test/sample";
import { intro, ompSessions, outro, writeJournal } from "../../feature";
import { shopApi } from "../../shop-api";

export default {
	plugins: ["piebird-sessions"],
	projectName: "shop-api",
	async setup(s) {
		await writeProject(s.project, shopApi, "Cart and shipping totals");
		await omp(s, "-p", "Just reply: Ready.");
		// The earlier session: a cache on /products, two questions asked and answered.
		const file = join(await ompSessions(s), `2026-10-11T09-00-00-000Z_${SAMPLE_ID}.jsonl`);
		await writeJournal(file, sampleJournal(s.project));
	},
	async run(d) {
		await intro(d, "piebird-sessions", "the questions you were asked, and your answers");
		await d.prompt(
			"When you added the products cache, you asked me two questions. What were the options, and what did I answer?",
		);
		d.caption("The question, its options, and your answer", "the option you picked, or what you typed");
		await d.wait(5000);
		await d.prompt("Now only my own messages from that session, word for word.");
		d.caption("Only your words", "not the agent's, not the tool calls");
		await d.wait(4000);
		await outro(d, "piebird-sessions");
	},
} satisfies Scenario;
