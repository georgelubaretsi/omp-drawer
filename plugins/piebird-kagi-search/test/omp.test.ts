// The omp part with a stand-in for omp's extension API and the vault's golden replies: the Kagi
// tools, and omp's web_search hidden or shown as the "search" setting says.
import type { Io } from "../kit/core/io";
import type { Surroundings } from "../src/index";
import { describe, expect, test } from "bun:test";
import { instructions } from "../core/search";
import { bunIo } from "../kit/bun/io";
import { BUILT_IN, kagiInOmp } from "../src/index";
import { goldenIo } from "./golden";

const HOME = "/home/ada";
const PERSON = `${HOME}/.agents/piebird/settings.json`;

interface Tool {
	readonly name: string;
	execute(...args: unknown[]): Promise<{ content: { text: string }[]; isError?: boolean }>;
}

type Handler = (event: Readonly<Record<string, unknown>>, ctx: { cwd: string }) => unknown;

/** The part loaded in a session whose tools are `active`, with `io` and omp's own choice per project. */
function load(io: Io, ompChoice?: string | Readonly<Record<string, string>>, active = ["read", BUILT_IN, "write"]) {
	const tools = new Map<string, Tool>();
	const handlers = new Map<string, Handler>();
	const pi = {
		setLabel: () => undefined,
		registerTool: (tool: Tool) => void tools.set(tool.name, tool),
		on: (event: string, handler: Handler) => void handlers.set(event, handler),
		getActiveTools: () => [...active],
		setActiveTools: async (names: string[]) => void active.splice(0, active.length, ...names),
	};
	const choiceIn = (cwd: string) => (typeof ompChoice === "object" ? ompChoice[cwd] : ompChoice);
	const at: Surroundings = { io, home: HOME, plugin: "/plugin", windows: false, ompChoice: choiceIn };
	// The part's parameter is omp's ExtensionAPI; the stand-in has the part of it the part uses.
	Reflect.apply(kagiInOmp, undefined, [pi, at]);
	const fire = async (event: string, payload: Readonly<Record<string, unknown>> = {}, cwd = "/work") =>
		handlers.get(event)?.(payload, { cwd });
	const search = async (input: object, signal?: AbortSignal) => {
		const tool = tools.get("kagi_search");
		if (tool === undefined) throw new Error("no kagi_search");
		return tool.execute("call-1", input, signal, undefined, { cwd: "/work" });
	};
	return { active, fire, search };
}

const TIMEOUT = { query: "go http client timeout" };
/** A search the vault answers with sign-in-needed: no session is kept (golden.ts). */
const NO_SESSION = { query: "rust async runtime" };

describe("Kagi first", () => {
	test("web_search is hidden while Kagi answers", async () => {
		const { active, fire, search } = load(goldenIo());
		await fire("session_start");
		const answer = await search(TIMEOUT);
		expect(answer.content[0]?.text).toStartWith("1. [The complete guide to Go net/http timeouts]");
		expect(active).toEqual(["read", "write"]);
	});

	test("web_search is back once Kagi can't be searched", async () => {
		const { active, fire, search } = load(goldenIo());
		await fire("session_start");
		expect((await search(NO_SESSION)).isError).toBe(true);
		expect(active).toEqual(["read", "write", BUILT_IN]);
	});

	test("a call the model got wrong doesn't bring it back", async () => {
		const { active, fire, search } = load(goldenIo());
		await fire("session_start");
		const wrong = await search({ ...TIMEOUT, from_date: "2026-10-12", to_date: "2026-10-01" });
		expect(wrong.isError).toBe(true);
		expect(active).toEqual(["read", "write"]);
	});

	test("the model is told to search with Kagi first, after the system prompt", async () => {
		const { fire } = load(goldenIo());
		await fire("session_start");
		expect(await fire("before_agent_start", { systemPrompt: ["Base."] })).toEqual({
			systemPrompt: ["Base.", instructions("first").text],
		});
	});
});

describe("the other choices", () => {
	test("Kagi only, omp's own choice, keeps web_search hidden even after Kagi fails", async () => {
		const { active, fire, search } = load(goldenIo(), "only");
		await fire("session_start");
		expect((await search(NO_SESSION)).isError).toBe(true);
		expect(active).toEqual(["read", "write"]);
	});

	test("Kagi offered, the person's choice for every agent, leaves web_search alone", async () => {
		const files = { [PERSON]: JSON.stringify({ "piebird-kagi-search": { search: "offered" } }) };
		const { active, fire } = load(goldenIo({ files }));
		await fire("session_start");
		expect(active).toEqual(["read", BUILT_IN, "write"]);
	});
});

describe("a new session in the same omp", () => {
	test("in a project that offers Kagi, web_search is back", async () => {
		const { active, fire } = load(goldenIo(), { "/kagi-only": "only", "/open": "offered" });
		await fire("session_start", {}, "/kagi-only");
		expect(active).toEqual(["read", "write"]);
		await fire("session_start", {}, "/open");
		expect(active).toEqual(["read", "write", BUILT_IN]);
	});

	test("starts without the last session's Kagi failure", async () => {
		const { active, fire, search } = load(goldenIo());
		await fire("session_start");
		expect((await search(NO_SESSION)).isError).toBe(true);
		expect(active).toContain(BUILT_IN);
		await fire("session_start");
		expect(active).toEqual(["read", "write"]);
	});

	test("web_search the person had turned off stays off", async () => {
		const { active, fire } = load(goldenIo(), { "/kagi-only": "only", "/open": "offered" }, ["read", "write"]);
		await fire("session_start", {}, "/kagi-only");
		await fire("session_start", {}, "/open");
		expect(active).toEqual(["read", "write"]);
	});
});

describe("a cancelled call", () => {
	test("stops the vault, and isn't Kagi failing: web_search stays hidden", async () => {
		// A vault that would take half a minute to answer.
		const io: Io = { ...goldenIo(), run: async (_argv, options) => bunIo().run(["sleep", "30"], options) };
		const { active, fire, search } = load(io);
		await fire("session_start");
		expect((await search(TIMEOUT, AbortSignal.abort())).isError).toBe(true);
		expect(active).toEqual(["read", "write"]);
	});
});
