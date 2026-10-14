import { afterEach, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { type Computer, computer, failed, ok } from "./fixture";
import { install, uninstall } from "./flow";
import { installerHandler } from "./server";
import type { Ran } from "./system";

let c: Computer;
afterEach(() => c.cleanup());

const BOTH = ["piebird-search", "piebird-notes"];

type Handlers = Record<string, (arg: string) => Ran>;

/** A fake `<agent> plugin ...` command: the subcommand ("install", "marketplace add") and its argument picked out of the flags. */
function command(handlers: Handlers): (argv: readonly string[]) => Ran {
	return argv => {
		const words = argv.filter(x => !x.startsWith("--") && x !== "user").slice(1);
		const key = words[0] === "marketplace" ? `marketplace ${words[1]}` : (words[0] ?? "");
		return handlers[key]?.(words.at(-1) ?? "") ?? failed(`unknown: ${argv.join(" ")}`);
	};
}

/** omp's plugin command, keeping its marketplace and installs as omp does. */
function fakeOmp(market?: string) {
	const state = { market, installed: new Set<string>() };
	const run = command({
		"marketplace list": () =>
			ok(state.market ? `Configured Marketplaces:\n\n  piebird  ${state.market}\n` : "No marketplaces configured\n"),
		"marketplace add": path => {
			state.market = path;
			return ok();
		},
		"marketplace update": () => ok(),
		"marketplace remove": () => {
			if (!state.market) return failed("Marketplace not found");
			state.market = undefined;
			return ok();
		},
		list: () =>
			ok(
				JSON.stringify({
					npm: [],
					marketplace: [...state.installed].map(id => ({ id, entries: [{ scope: "user", version: "1" }] })),
				}),
			),
		install: id => {
			if (state.installed.has(id)) return failed("already installed");
			state.installed.add(id);
			return ok();
		},
		upgrade: id => (state.installed.has(id) ? ok() : failed("not installed")),
		uninstall: id => (state.installed.delete(id) ? ok() : failed("not installed")),
	});
	return { state, run };
}

/** Claude Code's plugin command, keeping its marketplace and installs; removing the marketplace uninstalls its plugins. */
function fakeClaude() {
	const state: { market?: string; installed: Set<string> } = { installed: new Set() };
	const run = command({
		"marketplace list": () =>
			ok(JSON.stringify(state.market ? [{ name: "piebird", source: "directory", path: state.market }] : [])),
		"marketplace add": path => {
			state.market = path;
			return ok();
		},
		"marketplace remove": () => {
			if (!state.market) return failed("not found");
			delete state.market;
			state.installed.clear();
			return ok();
		},
		install: id => {
			if (!state.market) return failed("no marketplace");
			state.installed.add(id);
			return ok();
		},
		list: () => ok(JSON.stringify([...state.installed].map(id => ({ id, enabled: true })))),
	});
	return { state, run };
}

describe("omp", () => {
	test("installs from the shared copy, again as an upgrade, and removes what it installed", async () => {
		const omp = fakeOmp();
		c = computer({ omp: "/bin/omp" }, { omp: omp.run });
		expect((await install(c.ctx, BOTH))[0]).toMatchObject({
			ok: true,
			text: "omp: Search and Notes installed; new sessions have them.",
		});
		expect(omp.state.market).toBe(realpathSync(join(c.home, ".agents/piebird/marketplace")));
		expect([...omp.state.installed]).toEqual(["piebird-search@piebird", "piebird-notes@piebird"]);
		expect((await install(c.ctx, BOTH))[0]).toMatchObject({ ok: true });
		expect((await uninstall(c.ctx))[0]).toMatchObject({ ok: true, text: "omp: the piebird plugins are removed." });
		expect(omp.state).toEqual({ market: undefined, installed: new Set() });
	});

	test("leaves a piebird marketplace from a checkout alone", async () => {
		const omp = fakeOmp("/src/piebird/plugins");
		omp.state.installed.add("piebird-search@piebird");
		c = computer({ omp: "/bin/omp" }, { omp: omp.run });
		const [step] = await install(c.ctx, BOTH);
		expect(step?.ok).toBe(false);
		expect(step?.text).toStartWith(
			"omp: omp has its piebird plugins from /src/piebird/plugins; they were left as they are.",
		);
		await uninstall(c.ctx);
		expect(omp.state).toEqual({ market: "/src/piebird/plugins", installed: new Set(["piebird-search@piebird"]) });
	});
});

describe("Claude Code's command", () => {
	test("installs Claude's plugins from the shared copy, and removing the marketplace removes them", async () => {
		const claude = fakeClaude();
		c = computer({ claude: "/bin/claude" }, { claude: claude.run });
		const steps = await install(c.ctx, BOTH);
		expect(steps.find(s => s.agent === "claude")).toMatchObject({
			ok: true,
			text: "Claude Code: Search installed; new sessions have them.",
		});
		expect([...claude.state.installed]).toEqual(["piebird-search@piebird"]);
		await uninstall(c.ctx);
		expect(claude.state).toEqual({ market: undefined, installed: new Set() });
	});
});

async function post(handle: (r: Request) => Promise<Response>, body: unknown): Promise<unknown> {
	const res = await handle(new Request("http://127.0.0.1/x/", { method: "POST", body: JSON.stringify(body) }));
	const answer: unknown = await res.json();
	return answer;
}

describe("the page", () => {
	test("opens and restarts only what the last install offered, and signs in only with a vault", async () => {
		let running = true;
		const osascript = (a: readonly string[]) => {
			if (a[1]?.endsWith("to quit")) running = false;
			return ok(String(running));
		};
		c = computer(
			{ apps: { claude: "/Applications/Claude.app", chatgpt: "/Applications/ChatGPT.app" } },
			{ osascript },
		);
		const handle = installerHandler(c.ctx, { bye: () => {} });
		expect(await post(handle, { op: "open", index: 0 })).toEqual({ text: "Nothing to open" });
		expect(await post(handle, { op: "install", plugins: ["piebird-search", "piebird-unknown"] })).toMatchObject({
			opens: [{ label: "Add Search to Claude" }],
			restarts: [{ app: "chatgpt", label: "ChatGPT" }],
			signIns: [{ plugin: "piebird-search", label: "Sign in for Search" }],
		});
		expect(await post(handle, { op: "restart", app: "claude" })).toEqual({ text: "Nothing to restart" });
		expect(await post(handle, { op: "open", index: 1 })).toEqual({ text: "Nothing to open" });
		expect(await post(handle, { op: "open", index: 0 })).toEqual({ text: "Opened in Claude" });
		const mcpb = join(c.home, ".agents/piebird/mcpb/piebird-search.mcpb");
		expect(c.ran).toContainEqual(["open", "-b", "com.anthropic.claudefordesktop", mcpb]);
		expect(await post(handle, { op: "restart", app: "chatgpt" })).toEqual({ text: "ChatGPT restarted" });
		expect(c.ran).toContainEqual(["open", "-b", "com.openai.codex"]);
		await post(handle, { op: "sign-in", plugin: "piebird-search" });
		expect(c.ran.at(-1)).toEqual(["search-vault", "sign-in"]);
		expect(await post(handle, { op: "sign-in", plugin: "piebird-notes" })).toEqual({ text: "No sign-in for that" });
	});
});
