import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { CATALOG, cleanup, MANIFEST, problems, put, tree } from "./fixtures";
import { build, check } from "./output";
import { MCP_SCHEMA } from "./schemas";

afterEach(cleanup);

const stdio = (extra: object) => ({ type: "stdio", command: "uvx", ...extra });
const remote = (extra: object) => ({ type: "streamable-http", url: "https://example.com/mcp", ...extra });

describe("Claude Code cross-host rules (claude host only)", () => {
	const M = "plugins/demo/mcp.json: /mcpServers/s";
	const P = "plugins/demo/plugin.json:";
	const DROP = "or drop the claude host";
	const EXPANDS = "Claude Code expands ${...} here from the user's environment, Agent Plugins hosts keep it literal";
	const BOTH = "only ${PLUGIN_ROOT} and ${PLUGIN_DATA} work on both";
	const cases: { name: string; server?: object; manifest?: object; catalogName?: string; errors: string[] }[] = [
		{
			name: "accepted: placeholders the translation rewrites",
			server: stdio({ args: ["${PLUGIN_DATA}/db", "${PLUGIN_ROOT}"], env: { A: "${PLUGIN_ROOT}/x" } }),
			errors: [],
		},
		{
			name: "accepted: $ without braces, env key with ${",
			server: stdio({ args: ["$HOME", "a$b"], env: { "${X}": "1" } }),
			errors: [],
		},
		{
			name: "accepted: remote with plain headers",
			server: remote({ headers: { "X-Tenant": "public" } }),
			errors: [],
		},
		{
			name: "accepted: author with name, homepage URL",
			manifest: { author: { name: "A" }, homepage: "https://example.com" },
			errors: [],
		},
		{
			name: "cwd ./work",
			server: stdio({ cwd: "./work" }),
			errors: [`${M}/cwd Claude Code doesn't support cwd for plugin MCP servers; drop cwd ${DROP}`],
		},
		{
			name: "cwd ${PLUGIN_DATA}",
			server: stdio({ cwd: "${PLUGIN_DATA}" }),
			errors: [`${M}/cwd Claude Code doesn't support cwd for plugin MCP servers; drop cwd ${DROP}`],
		},
		...["${HOME}/x", "${PLUGIN_ROOT:-/opt}", "${CLAUDE_PLUGIN_ROOT}/x", "${PLUGIN_DATA}/${USER}"].map(value => ({
			name: `args: ${value}`,
			server: stdio({ args: ["ok", value] }),
			errors: [`${M}/args/1 ${EXPANDS}; ${BOTH}; drop it ${DROP}`],
		})),
		{
			name: "env value ${HOME}",
			server: stdio({ env: { H: "${HOME}" } }),
			errors: [`${M}/env/H ${EXPANDS}; ${BOTH}; drop it ${DROP}`],
		},
		{
			name: "url with ${...}",
			server: { type: "sse", url: "https://example.com/${TENANT}/sse" },
			errors: [`${M}/url ${EXPANDS}; drop it ${DROP}`],
		},
		{
			name: "header value with ${...}",
			server: remote({ headers: { Authorization: "Bearer ${TOKEN}" } }),
			errors: [`${M}/headers/Authorization ${EXPANDS}; drop it ${DROP}`],
		},
		{
			name: "author without name",
			manifest: { author: { email: "a@example.com" } },
			errors: [`${P} /author/name is required by Claude Code; add it ${DROP}`],
		},
		{
			name: "author with a blank name",
			manifest: { author: { name: " " } },
			errors: [`${P} /author/name is required by Claude Code; add it ${DROP}`],
		},
		{
			name: "homepage that isn't a URL",
			manifest: { homepage: "example.com/x" },
			errors: [
				`${P} /homepage must be a URL for Claude Code, which refuses to load the plugin otherwise; fix it ${DROP}`,
			],
		},
		{
			name: "reserved marketplace name",
			catalogName: "healthcare",
			errors: [
				`catalog.json: /name "healthcare" is reserved by Claude Code, which refuses to add the marketplace; rename it ${DROP}`,
			],
		},
	];
	for (const c of cases) {
		for (const hosts of [["omp", "claude"], ["omp"]]) {
			test(`${c.name} (${hosts.join(", ")})`, async () => {
				const root = await tree(hosts);
				if (c.catalogName)
					await put(root, "catalog.json", {
						...CATALOG,
						name: c.catalogName,
						plugins: [{ name: "demo", category: "development", hosts }],
					});
				if (c.manifest) await put(root, "plugins/demo/plugin.json", { ...MANIFEST, ...c.manifest });
				if (c.server)
					await put(root, "plugins/demo/mcp.json", { $schema: MCP_SCHEMA, mcpServers: { s: c.server } });
				expect(await problems(root)).toEqual(hosts.includes("claude") ? c.errors : []);
			});
		}
	}
});

describe("build", () => {
	test("translates mcp.json into Claude's .mcp.json", async () => {
		const root = await tree(["omp", "claude"]);
		await put(root, "plugins/demo/bin/server", "#!/bin/sh\n");
		await put(root, "plugins/demo/mcp.json", {
			$schema: MCP_SCHEMA,
			mcpServers: {
				local: {
					type: "stdio",
					command: "./bin/server",
					args: ["--data", "${PLUGIN_DATA}/db", "--root", "${PLUGIN_ROOT}"],
					env: { CACHE: "${PLUGIN_DATA}/cache" },
				},
				relative: { type: "stdio", command: "./bin/../bin/server" },
				bare: { type: "stdio", command: "uvx" },
				remote: { type: "streamable-http", url: "https://example.com/mcp", headers: { "X-Tenant": "public" } },
				events: { type: "sse", url: "https://example.com/sse" },
			},
		});
		await build(root);
		const mcp: unknown = JSON.parse(await readFile(join(root, "plugins/demo/.mcp.json"), "utf8"));
		expect(mcp).toEqual({
			mcpServers: {
				local: {
					type: "stdio",
					command: "${CLAUDE_PLUGIN_ROOT}/bin/server",
					args: ["--data", "${CLAUDE_PLUGIN_DATA}/db", "--root", "${CLAUDE_PLUGIN_ROOT}"],
					env: { CACHE: "${CLAUDE_PLUGIN_DATA}/cache" },
				},
				relative: { type: "stdio", command: "${CLAUDE_PLUGIN_ROOT}/bin/server" },
				bare: { type: "stdio", command: "uvx" },
				remote: { type: "http", url: "https://example.com/mcp", headers: { "X-Tenant": "public" } },
				events: { type: "sse", url: "https://example.com/sse" },
			},
		});
		expect(await check(root)).toEqual([]);
	});

	test("check reports stale and unexpected generated files", async () => {
		const root = await tree(["omp", "claude"]);
		await build(root);
		expect(await check(root)).toEqual([]);

		await put(root, "catalog.json", CATALOG);
		await put(root, "plugins/demo/plugin.json", { ...MANIFEST, description: "Changed description" });
		expect(await check(root)).toEqual([
			"differs: .omp-plugin/marketplace.json",
			"unexpected: .claude-plugin/marketplace.json",
			"unexpected: plugins/demo/.claude-plugin/plugin.json",
		]);

		await build(root);
		expect(await check(root)).toEqual([]);
	});

	test("check reports and build deletes .mcp.json when mcp.json is removed", async () => {
		const root = await tree(["claude"]);
		await put(root, "plugins/demo/mcp.json", { $schema: MCP_SCHEMA, mcpServers: {} });
		await build(root);
		await rm(join(root, "plugins/demo/mcp.json"));
		expect(await check(root)).toEqual(["unexpected: plugins/demo/.mcp.json"]);
		expect(await build(root)).toEqual(["deleted: plugins/demo/.mcp.json"]);
		expect(await check(root)).toEqual([]);
	});
});
