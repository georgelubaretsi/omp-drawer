import { afterEach, describe, expect, test } from "bun:test";
import { type Case, cleanup, link, plainMcp, problems, put, tree } from "./fixtures";
import { MCP_SCHEMA, PLUGIN_SCHEMA } from "./schemas";

afterEach(cleanup);

const S = "plugins/demo/mcp.json: /mcpServers/s";

/** Runs each case as the only server "s" of plugins/demo/mcp.json, with a bundled bin/server. */
function serverCases(cases: Case[]): void {
	for (const c of cases) {
		test(c.name, async () => {
			const root = await tree(["omp"]);
			await put(root, "plugins/demo/bin/server", "#!/bin/sh\n");
			await put(root, "plugins/demo/bin/demo server", "#!/bin/sh\n");
			const doc = { $schema: MCP_SCHEMA, mcpServers: { s: c.value } };
			await put(root, "plugins/demo/mcp.json", doc);
			expect(await problems(root)).toEqual(c.errors ?? []);
			expect(plainMcp(doc)).toBe(c.by !== "schema");
		});
	}
}

describe("mcp.json closed server shapes", () => {
	serverCases([
		{ name: "stdio ok", value: { type: "stdio", command: "uvx", args: ["x"] } },
		{ name: "streamable-http ok", value: { type: "streamable-http", url: "https://example.com/mcp" } },
		{ name: "sse ok", value: { type: "sse", url: "https://example.com/sse" } },
		{
			name: "stdio with url",
			value: { type: "stdio", command: "uvx", url: "https://x" },
			errors: [`${S} must NOT have additional properties: "url"`],
			by: "schema",
		},
		{
			name: "streamable-http with command",
			value: { type: "streamable-http", url: "https://example.com/mcp", command: "uvx" },
			errors: [`${S} must NOT have additional properties: "command"`],
			by: "schema",
		},
		{
			name: "unknown field",
			value: { type: "stdio", command: "uvx", timeout: 5 },
			errors: [`${S} must NOT have additional properties: "timeout"`],
			by: "schema",
		},
		{
			name: "unknown type",
			value: { type: "websocket", url: "wss://example.com" },
			errors: [`${S} value of tag "type" must be in oneOf: "websocket"`],
			by: "schema",
		},
		{ name: "missing type", value: { command: "uvx" }, errors: [`${S} tag "type" must be string`], by: "schema" },
		{
			name: "stdio without command",
			value: { type: "stdio" },
			errors: [`${S} must have required property 'command'`],
			by: "schema",
		},
		{
			name: "remote without url",
			value: { type: "sse" },
			errors: [`${S} must have required property 'url'`],
			by: "schema",
		},
	]);
});

describe("mcp.json reserved env names", () => {
	serverCases([
		{
			name: "other names ok",
			value: { type: "stdio", command: "uvx", env: { CACHE: "${PLUGIN_DATA}/c", HOME_VAR: "${HOME}" } },
		},
		{
			name: "PLUGIN_ROOT",
			value: { type: "stdio", command: "uvx", env: { PLUGIN_ROOT: "/x" } },
			errors: [`${S}/env/PLUGIN_ROOT must NOT be valid: {"enum":["PLUGIN_ROOT","PLUGIN_DATA"]}`],
			by: "schema",
		},
		{
			name: "PLUGIN_DATA",
			value: { type: "stdio", command: "uvx", env: { PLUGIN_DATA: "/x" } },
			errors: [`${S}/env/PLUGIN_DATA must NOT be valid: {"enum":["PLUGIN_ROOT","PLUGIN_DATA"]}`],
			by: "schema",
		},
		{
			name: "non-string value",
			value: { type: "stdio", command: "uvx", env: { N: 1 } },
			errors: [`${S}/env/N must be string`],
			by: "schema",
		},
	]);
});

const ROOT_ESCAPE = "must stay inside the plugin root after normalization (Agent Plugins §4.1, §7.2.1)";
const NODE_MODULES = "must point inside the package; node_modules isn't part of it";
const CWD_FORM = 'must match pattern "^(?:\\./|\\$\\{PLUGIN_ROOT\\}(?:/|$)|\\$\\{PLUGIN_DATA\\}(?:/|$))"';
const cwd = (value: string) => ({ type: "stdio", command: "uvx", cwd: value });
const command = (value: string) => ({ type: "stdio", command: value });

describe("mcp.json stdio cwd", () => {
	serverCases([
		{ name: "./work ok", value: cwd("./work") },
		{ name: "./ ok", value: cwd("./") },
		{ name: "./bin/../work ok", value: cwd("./bin/../work") },
		{ name: "existing ./bin ok", value: cwd("./bin") },
		{ name: "${PLUGIN_ROOT} ok", value: cwd("${PLUGIN_ROOT}") },
		{ name: "${PLUGIN_ROOT}/bin ok", value: cwd("${PLUGIN_ROOT}/bin") },
		{ name: "${PLUGIN_DATA} ok", value: cwd("${PLUGIN_DATA}") },
		{ name: "${PLUGIN_DATA}/cache ok", value: cwd("${PLUGIN_DATA}/cache") },
		{ name: ". alone", value: cwd("."), errors: [`${S}/cwd ${CWD_FORM}`], by: "schema" },
		{ name: "bare relative", value: cwd("data"), errors: [`${S}/cwd ${CWD_FORM}`], by: "schema" },
		{ name: "absolute", value: cwd("/tmp"), errors: [`${S}/cwd ${CWD_FORM}`], by: "schema" },
		{ name: "${PLUGIN_ROOT} glued", value: cwd("${PLUGIN_ROOT}x"), errors: [`${S}/cwd ${CWD_FORM}`], by: "schema" },
		{ name: "other placeholder", value: cwd("${HOME}/x"), errors: [`${S}/cwd ${CWD_FORM}`], by: "schema" },
		{ name: "./..", value: cwd("./.."), errors: [`${S}/cwd ${ROOT_ESCAPE}`], by: "prose" },
		{ name: "./a/../../x", value: cwd("./a/../../x"), errors: [`${S}/cwd ${ROOT_ESCAPE}`], by: "prose" },
		{ name: "backslash ..", value: cwd("./a\\..\\..\\x"), errors: [`${S}/cwd ${ROOT_ESCAPE}`], by: "prose" },
		{ name: "${PLUGIN_ROOT}/..", value: cwd("${PLUGIN_ROOT}/.."), errors: [`${S}/cwd ${ROOT_ESCAPE}`], by: "prose" },
		{
			name: "${PLUGIN_DATA}/../x",
			value: cwd("${PLUGIN_DATA}/../x"),
			errors: [`${S}/cwd must stay inside \${PLUGIN_DATA} after normalization (Agent Plugins §7.2.1)`],
			by: "prose",
		},
		{ name: "${PLUGIN_DATA}/node_modules ok (the host's folder)", value: cwd("${PLUGIN_DATA}/node_modules") },
		{ name: "./node_modules_cache ok (not a node_modules part)", value: cwd("./node_modules_cache") },
		...[
			"./node_modules",
			"./node_modules/pkg",
			"${PLUGIN_ROOT}/node_modules/pkg",
			"./a/node_modules/../b",
			"./Node_Modules/pkg",
			"./a\\node_modules",
		].map(value => ({
			name: `through node_modules: ${value}`,
			value: cwd(value),
			errors: [`${S}/cwd ${NODE_MODULES}`],
			by: "prose" as const,
		})),
	]);
});

describe("mcp.json stdio command", () => {
	serverCases([
		{ name: "bare name ok", value: command("uvx") },
		{ name: "bundled ./bin/server ok", value: command("./bin/server") },
		{ name: "./bin/../bin/server ok", value: command("./bin/../bin/server") },
		{
			name: "placeholder path",
			value: command("${PLUGIN_ROOT}/bin/server"),
			errors: [
				`${S}/command must not contain placeholders; hosts never expand command (Agent Plugins §7.2.1, §9.2)`,
			],
			by: "prose",
		},
		{
			name: "placeholder bare",
			value: command("${TOOL}"),
			errors: [
				`${S}/command must not contain placeholders; hosts never expand command (Agent Plugins §7.2.1, §9.2)`,
			],
			by: "prose",
		},
		{
			name: "shell string",
			value: command("uvx run"),
			errors: [`${S}/command must be one executable token, not a shell command (Agent Plugins §7.2.1)`],
			by: "prose",
		},
		{
			name: "bare name with a tab",
			value: command("uvx\trun"),
			errors: [`${S}/command must be one executable token, not a shell command (Agent Plugins §7.2.1)`],
			by: "prose",
		},
		{ name: "bundled ./ path with a space ok", value: command("./bin/demo server") },
		{
			name: "./ path followed by an argument",
			value: command("./bin/server --stdio"),
			errors: [`${S}/command must name a file bundled in the plugin; arguments go in args (Agent Plugins §7.2.1)`],
			by: "prose",
		},
		...["../bin/server", "bin/server", "/usr/bin/env", "bin\\server"].map(value => ({
			name: `not ./: ${value}`,
			value: command(value),
			errors: [`${S}/command must be a bare executable name or a path starting with ./ (Agent Plugins §7.2.1)`],
			by: "prose" as const,
		})),
		{ name: "./x/../../y", value: command("./x/../../y"), errors: [`${S}/command ${ROOT_ESCAPE}`], by: "prose" },
		{
			name: "backslash ..",
			value: command("./bin\\..\\..\\y"),
			errors: [`${S}/command ${ROOT_ESCAPE}`],
			by: "prose",
		},
		{
			name: "missing bundled file",
			value: command("./bin/missing"),
			errors: [`${S}/command must name a file bundled in the plugin (Agent Plugins §7.2.1)`],
			by: "prose",
		},
		{
			name: "directory",
			value: command("./bin"),
			errors: [`${S}/command must name a file bundled in the plugin (Agent Plugins §7.2.1)`],
			by: "prose",
		},
		...[
			"./node_modules/.bin/server",
			"./node_modules/../bin/server",
			"./bin/../node_modules/pkg/server",
			"./NODE_MODULES/pkg/server",
			"./node_modules\\pkg\\server",
		].map(value => ({
			name: `through node_modules: ${value}`,
			value: command(value),
			errors: [`${S}/command ${NODE_MODULES}`],
			by: "prose" as const,
		})),
		{
			name: "empty",
			value: command(""),
			errors: [`${S}/command must NOT have fewer than 1 characters`],
			by: "schema",
		},
	]);

	test("the reported case: a command through a node_modules package that links outside", async () => {
		const root = await tree(["omp"]);
		await put(root, "outside/bin/server", "#!/bin/sh\n");
		await link(root, "outside", "plugins/demo/node_modules/pkg");
		await put(root, "plugins/demo/mcp.json", {
			$schema: MCP_SCHEMA,
			mcpServers: { s: { type: "stdio", command: "./node_modules/pkg/bin/server" } },
		});
		expect(await problems(root)).toEqual([`${S}/command ${NODE_MODULES}`]);
	});
});

const ABSOLUTE = "must be an absolute http:// or https:// URL (Agent Plugins §7.2.1)";
const HTTPS = "must use https unless the host is localhost or a loopback IP literal (Agent Plugins §7.2.1)";
const url = (value: string) => ({ type: "streamable-http", url: value });
const headers = (value: unknown) => ({ type: "sse", url: "https://example.com/sse", headers: value });

describe("mcp.json remote url", () => {
	serverCases([
		...[
			"https://example.com/mcp",
			"HTTPS://example.com/mcp",
			"http://localhost/mcp",
			"http://localhost:3000/mcp",
			"http://127.0.0.1:8080/mcp",
			"http://127.10.0.1/mcp",
			"http://[::1]:8080/mcp",
			"http://[0:0:0:0:0:0:0:1]/mcp",
		].map(value => ({ name: `${value} ok`, value: url(value) })),
		...["/mcp", "example.com/mcp", "ftp://example.com/mcp", "https:example.com", "https://exa mple.com/"].map(
			value => ({
				name: `not absolute http(s): ${value}`,
				value: url(value),
				errors: [`${S}/url ${ABSOLUTE}`],
				by: "prose" as const,
			}),
		),
		...[
			"http://example.com/mcp",
			"http://localhost.example.com/mcp",
			"http://LOCALHOST/mcp",
			"http://127.0.0.1.nip.io/mcp",
			"http://0x7f.0.0.1/mcp",
			"http://128.0.0.1/mcp",
			"http://[::ffff:127.0.0.1]/mcp",
		].map(value => ({
			name: `plain http, not loopback: ${value}`,
			value: url(value),
			errors: [`${S}/url ${HTTPS}`],
			by: "prose" as const,
		})),
		...["https://u:p@example.com/x", "https://u@example.com/x", "https://@example.com/x"].map(value => ({
			name: `userinfo: ${value}`,
			value: url(value),
			errors: [`${S}/url must not contain user information (Agent Plugins §7.2.1)`],
			by: "prose" as const,
		})),
		...["https://example.com/x#top", "https://example.com/x#"].map(value => ({
			name: `fragment: ${value}`,
			value: url(value),
			errors: [`${S}/url must not contain a fragment (Agent Plugins §7.2.1)`],
			by: "prose" as const,
		})),
		{ name: "empty", value: url(""), errors: [`${S}/url must NOT have fewer than 1 characters`], by: "schema" },
	]);
});

describe("mcp.json remote headers", () => {
	serverCases([
		{ name: "valid ok", value: headers({ "X-Tenant": "public", Accept: "" }) },
		{
			name: "name with a space",
			value: headers({ "X Tenant": "a" }),
			errors: [`${S}/headers/X Tenant name must be an HTTP field name (Agent Plugins §7.2.1, RFC 9110 §5.1)`],
			by: "prose",
		},
		{
			name: "value with a newline",
			value: headers({ "X-A": "a\r\nX-B: b" }),
			errors: [`${S}/headers/X-A must be an HTTP field value (Agent Plugins §7.2.1, RFC 9110 §5.5)`],
			by: "prose",
		},
		{
			name: "same name in different case",
			value: headers({ "X-A": "1", "x-a": "2" }),
			errors: [`${S}/headers/x-a repeats a header name in different case (Agent Plugins §7.2.1)`],
			by: "prose",
		},
		{
			name: "non-string value",
			value: headers({ "X-A": 1 }),
			errors: [`${S}/headers/X-A must be string`],
			by: "schema",
		},
	]);
});

describe("mcp.json document", () => {
	test("wrong $schema and extra top-level field", async () => {
		const root = await tree(["omp"]);
		await put(root, "plugins/demo/mcp.json", { $schema: PLUGIN_SCHEMA, mcpServers: {}, servers: {} });
		expect(await problems(root)).toEqual([
			'plugins/demo/mcp.json: must NOT have additional properties: "servers"',
			`plugins/demo/mcp.json: /$schema must be equal to constant: "${MCP_SCHEMA}"`,
		]);
	});
});
