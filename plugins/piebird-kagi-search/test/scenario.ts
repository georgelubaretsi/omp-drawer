// The scripted session behind piebird-kagi-search's "what the model sees" page
// (tools/model-page.ts): an agent uses each Kagi tool, then meets the errors it can make. The shells
// run as each agent loads them, in a made-up home folder whose copy of the plugin has a stand-in
// vault (fake-vault.ts), which answers with the real vault's replies against captured Kagi pages
// (golden.ts). The "search" setting is the default, first.
import type { Scenario, Setup, Step } from "../../../tools/model-page/types";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { register } from "../com.anthropic.claudecode/hooks/register";
import { operations } from "../core/operations.gen";
import { bunIo } from "../kit/bun/io";
import { traceMessages } from "../kit/core/model";
import { failureMarks } from "../program/marks";
import { kagiParts } from "../program/parts";
import { kagiInOmp } from "../src/index";

async function setup(home: string): Promise<Setup> {
	const project = join(home, "shop-api");
	const plugin = join(home, "plugins", "piebird-kagi-search");
	await mkdir(project, { recursive: true });
	await mkdir(join(plugin, "native"), { recursive: true });
	const vault = join(plugin, "native", "kagi-vault");
	await writeFile(vault, `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dir, "fake-vault.ts")}' "$@"\n`);
	await chmod(vault, 0o755);
	const session = (id: string) => ({ id, file: join(home, "sessions", `${id}.jsonl`) });
	return { project, plugin, sessions: { omp: session("omp"), claude: session("claude"), codex: session("codex") } };
}

const TIMEOUTS = "go http client timeout";

const call = (title: string, tool: string, input: Readonly<Record<string, unknown>>): Step => ({
	kind: "call",
	title,
	tool,
	input,
});

const STEPS: readonly Step[] = [
	{ kind: "start", title: "The session starts" },
	call("A web search", "kagi_search", { query: TIMEOUTS }),
	call("A search narrowed to the last week", "kagi_search", { query: TIMEOUTS, time: "week", limit: 3 }),
	call("Several searches at once", "kagi_batch_search", { queries: [TIMEOUTS, "go context deadline"], limit: 3 }),
	call("A quick answer", "kagi_quick", { query: "What is the boiling point of water?" }),
	call("Today's news categories", "kagi_news_categories", {}),
	call("Today's stories in a category", "kagi_news", { category: "3d_printing", limit: 3 }),
	call("The chaos index", "kagi_news_chaos", {}),
	call("The content-filter presets", "kagi_news_filter_presets", { lang: "en" }),
	call("A search of the News tab", "kagi_news_search", { query: "openai", limit: 5 }),
	call("The Small Web", "kagi_smallweb", { limit: 5 }),
	call("Whether the session works", "kagi_auth_status", {}),
	call("Raw mode: a read", "kagi_raw_read", { request: "https://news.kagi.com/api/batches/latest" }),
	call("A search on a computer where no one has signed in", "kagi_search", { query: "rust async runtime" }),
	call("Dates the wrong way round", "kagi_search", {
		query: TIMEOUTS,
		from_date: "2026-10-12",
		to_date: "2026-10-01",
	}),
	call("A batch with an empty query", "kagi_batch_search", { queries: [TIMEOUTS, " "] }),
	call("A category Kagi News doesn't have", "kagi_news", { category: "astrology" }),
	call("Raw mode outside Kagi", "kagi_raw_read", { request: "https://example.com/" }),
	call("Raw mode setting the cookie", "kagi_raw_write", {
		request: "POST /settings\nCookie: kagi_session=other\n\nx=1",
	}),
];

/** The plugin's folder the scenario made, with its stand-in vault. */
function pluginOf(made: Setup): string {
	if (made.plugin === undefined) throw new Error("the scenario makes its own plugin folder");
	return made.plugin;
}

export const scenario: Scenario = {
	plugin: "piebird-kagi-search",
	setup,
	steps: STEPS,
	operations,
	traceMessages,
	shells: {
		omp: (pi, at) =>
			Reflect.apply(kagiInOmp, undefined, [
				pi,
				{ io: bunIo(), home: homedir(), plugin: pluginOf(at), windows: false, ompChoice: () => undefined },
			]),
		claude: register,
		codex: at => {
			const place = { home: homedir(), project: at.project, plugin: pluginOf(at) };
			const marks = failureMarks(join(homedir(), ".cache", "kagi-failed"));
			return kagiParts({}, { io: bunIo(), place, windows: false, marks });
		},
	},
};
