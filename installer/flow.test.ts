import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Computer, computer, failed } from "./fixture";
import { install, uninstall } from "./flow";
import type { Sys } from "./system";

let c: Computer;
afterEach(() => c.cleanup());

const BOTH = ["piebird-search", "piebird-notes"];
const CHATGPT = "/Applications/ChatGPT.app";
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const put = (path: string, text: string) => {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, text);
};
const names = (market: unknown) =>
	(typeof market === "object" && market && "plugins" in market && Array.isArray(market.plugins)
		? market.plugins
		: []
	).map((p: { name: string }) => p.name);

describe("ChatGPT, with no codex command to install through", () => {
	test("gets each of its plugins listed, copied, cached at its version and switched on, beside the person's own", async () => {
		c = computer({ apps: { chatgpt: CHATGPT } });
		const personal = join(c.home, ".agents/plugins/marketplace.json");
		const config = join(c.home, ".codex/config.toml");
		put(
			personal,
			JSON.stringify({ name: "mine", plugins: [{ name: "theirs", source: { source: "local", path: "./x" } }] }),
		);
		put(config, '# mine\n[plugins."theirs@mine"]\nenabled = true\n');

		const steps = await install(c.ctx, BOTH);
		expect(steps.find(s => s.agent === "codex")).toMatchObject({ ok: true, restart: "chatgpt" });
		expect(names(read(personal))).toEqual(["theirs", "piebird-search"]);
		const mcp = read(join(c.home, ".codex/plugins/piebird-search/mcp.json"));
		expect(mcp).toMatchObject({
			mcpServers: { "piebird-search": { command: "./native/piebird-search", args: ["mcp"] } },
		});
		const cached = join(c.home, ".codex/plugins/cache/mine/piebird-search/1.2.0");
		expect(statSync(join(cached, "native/macos-arm64/piebird-search")).mode & 0o777).toBe(0o755);
		expect(existsSync(join(cached, "mcp.json"))).toBe(true);
		expect(Bun.TOML.parse(readFileSync(config, "utf8"))).toEqual({
			plugins: { "theirs@mine": { enabled: true }, "piebird-search@mine": { enabled: true } },
		});

		const removed = await uninstall(c.ctx);
		expect(removed.find(s => s.agent === "codex")).toMatchObject({ ok: true, restart: "chatgpt" });
		expect(names(read(personal))).toEqual(["theirs"]);
		expect(readFileSync(config, "utf8")).toBe('# mine\n[plugins."theirs@mine"]\nenabled = true\n');
		expect(existsSync(join(c.home, ".codex/plugins/cache/mine/piebird-search"))).toBe(false);
		expect(existsSync(join(c.home, ".codex/plugins/piebird-search"))).toBe(false);
		expect(existsSync(join(c.home, ".agents/piebird/marketplace"))).toBe(false);
	});

	test("installs through ChatGPT's codex command when there is one, and reports what it said when it fails", async () => {
		const codex = `${CHATGPT}/Contents/Resources/codex-cli/bin/codex`;
		c = computer({ apps: { chatgpt: CHATGPT }, codex }, { codex: () => failed("plugin not found in marketplace") });
		const [step] = (await install(c.ctx, BOTH)).filter(s => s.agent === "codex");
		expect(c.ran).toContainEqual(["codex", "plugin", "add", "piebird-search@piebird"]);
		expect(step).toMatchObject({
			ok: false,
			text: "Codex: piebird-search didn't install: plugin not found in marketplace",
		});
		expect(existsSync(join(c.home, ".codex/plugins/cache"))).toBe(false);
	});

	test("on Windows, runs each program from its .exe", async () => {
		c = computer({ apps: { chatgpt: CHATGPT } });
		const sys: Sys = { ...c.ctx.sys, platform: "win32" };
		await install({ ...c.ctx, sys }, BOTH);
		expect(read(join(c.home, ".codex/plugins/piebird-search/mcp.json"))).toMatchObject({
			mcpServers: { "piebird-search": { command: "./native/piebird-search.exe", args: ["mcp"] } },
		});
	});
});

function settings(of: Computer): string {
	return join(of.home, ".claude/settings.json");
}

describe("Claude's Code tab, with no Claude Code command", () => {
	test("gets the shared copy as a marketplace and its plugins switched on, the person's settings kept", async () => {
		c = computer({ apps: { claude: "/Applications/Claude.app" } });
		put(settings(c), JSON.stringify({ theme: "dark", enabledPlugins: { "x@y": true } }));
		await install(c.ctx, BOTH);
		const market = realpathSync(join(c.home, ".agents/piebird/marketplace"));
		expect(read(settings(c))).toEqual({
			theme: "dark",
			enabledPlugins: { "x@y": true, "piebird-search@piebird": true },
			extraKnownMarketplaces: { piebird: { source: { source: "directory", path: market } } },
		});
		await uninstall(c.ctx);
		expect(read(settings(c))).toEqual({ theme: "dark", enabledPlugins: { "x@y": true }, extraKnownMarketplaces: {} });
	});

	test("leaves a piebird marketplace from elsewhere alone, installing or removing", async () => {
		c = computer({ apps: { claude: "/Applications/Claude.app" } });
		const theirs = JSON.stringify({
			extraKnownMarketplaces: { piebird: { source: { source: "github", repo: "someone/piebird" } } },
		});
		put(settings(c), theirs);
		const [step] = (await install(c.ctx, BOTH)).filter(s => s.agent === "claude");
		expect(step?.text).toBe("Claude Code has its piebird plugins from someone/piebird; they were left as they are.");
		await uninstall(c.ctx);
		expect(readFileSync(settings(c), "utf8")).toBe(theirs);
	});

	test("never rewrites a settings file that isn't JSON, and the other apps still get theirs", async () => {
		c = computer({ apps: { claude: "/Applications/Claude.app", chatgpt: CHATGPT } });
		put(settings(c), "{ oops");
		const steps = await install(c.ctx, BOTH);
		expect(steps.find(s => s.agent === "claude")).toMatchObject({ ok: false });
		expect(steps.find(s => s.agent === "claude")?.text).toContain("isn't JSON");
		expect(readFileSync(settings(c), "utf8")).toBe("{ oops");
		expect(steps.find(s => s.agent === "codex")).toMatchObject({ ok: true });
	});

	test("never replaces a settings file it can't read", async () => {
		c = computer({ apps: { claude: "/Applications/Claude.app" } });
		put(settings(c), JSON.stringify({ theme: "dark" }));
		chmodSync(settings(c), 0o000);
		const steps = await install(c.ctx, BOTH);
		chmodSync(settings(c), 0o644);
		expect(steps.find(s => s.agent === "claude")).toMatchObject({ ok: false });
		expect(read(settings(c))).toEqual({ theme: "dark" });
	});
});

describe("Claude chat", () => {
	test("gets a .mcpb of each plugin with a program, to open with Claude, holding its manifest and programs", async () => {
		c = computer({ apps: { claude: "/Applications/Claude.app" } });
		const [step] = (await install(c.ctx, BOTH)).filter(s => s.agent === "claude-chat");
		const file = join(c.home, ".agents/piebird/mcpb/piebird-search.mcpb");
		expect(step?.opens).toEqual([{ label: "Add Search to Claude", app: "claude", file }]);
		const out = join(c.home, "unzipped");
		expect(Bun.spawnSync(["unzip", "-q", file, "-d", out]).exitCode).toBe(0);
		expect(read(join(out, "manifest.json"))).toMatchObject({
			name: "piebird-search",
			display_name: "Search",
			version: "1.2.0",
			server: { type: "binary", mcp_config: { command: "${__dirname}/native/piebird-search", args: ["mcp"] } },
		});
		expect(statSync(join(out, "native/macos-arm64/piebird-search")).mode & 0o777).toBe(0o755);
	});
});
