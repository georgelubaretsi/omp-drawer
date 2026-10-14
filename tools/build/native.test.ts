import { afterEach, describe, expect, test } from "bun:test";
import { CATALOG, cleanup, problems, put, SETTINGS, tree } from "./fixtures";
import { MCP_SCHEMA } from "./schemas";

afterEach(cleanup);

/**
 * A Claude Code tree whose plugin demo names `program` in the catalog, with a command in
 * cmd/<source>/ and a setting unless source is undefined; its server runs `command`.
 */
async function withProgram(program: string | undefined, command: string, source = program): Promise<string> {
	const root = await tree(["claude"]);
	const entry = { name: "demo", category: "development", hosts: ["claude"], ...(program ? { program } : {}) };
	await put(root, "catalog.json", { ...CATALOG, plugins: [entry] });
	if (source) {
		await put(root, `cmd/${source}/main.go`, "package main\n");
		await put(root, "plugins/demo/core/settings.json", SETTINGS);
	}
	await put(root, "plugins/demo/mcp.json", {
		$schema: MCP_SCHEMA,
		mcpServers: { demo: { type: "stdio", command, args: ["mcp"] } },
	});
	return root;
}

const unbundled = [
	"plugins/demo/mcp.json: /mcpServers/demo/command must name a file bundled in the plugin (Agent Plugins §7.2.1)",
];

describe("a plugin's program", () => {
	test("is built, never committed, so no server in mcp.json can run it", async () => {
		expect(await problems(await withProgram("dm", "./native/dm"))).toEqual(unbundled);
		expect(await problems(await withProgram(undefined, "./native/demo", "demo"))).toEqual(unbundled);
	});

	test("needs its command", async () => {
		expect(await problems(await withProgram("dm", "uvx", "other"))).toEqual([
			"catalog.json: /plugins/0/program names cmd/dm/, which has no main.go",
		]);
	});
});
