import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { cleanup, MANIFEST, put, track, tree } from "./fixtures";
import { isObject, type JsonObject } from "./json";
import { build } from "./output";
import { HOSTS, MCP_SCHEMA } from "./schemas";

afterEach(cleanup);

/** `v` as a JSON object; throws otherwise. */
function object(v: unknown): JsonObject {
	if (!isObject(v)) throw new TypeError(`expected a JSON object, got ${JSON.stringify(v)}`);
	return v;
}

/** Runs a consumer's CLI with HOME and its state in `state`; only PATH and TMPDIR come from this environment. */
async function runIsolated(
	cmd: string[],
	state: string,
	env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(cmd, {
		cwd: state,
		env: { PATH: process.env.PATH ?? "", TMPDIR: tmpdir(), HOME: join(state, "home"), ...env },
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		timeout: 60_000,
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stdout, stderr };
}

/** A built tree whose one plugin lists every host and uses every metadata field, a skill and every MCP shape Claude Code gets; plus a state folder. */
async function consumerTree(): Promise<{ root: string; state: string }> {
	const root = await tree([...HOSTS]);
	await put(root, "plugins/demo/plugin.json", {
		...MANIFEST,
		author: { name: "A", email: "a@example.com", url: "https://example.com" },
		homepage: "https://example.com",
		repository: "https://example.com/r",
		license: "MIT",
		keywords: ["demo"],
	});
	await put(
		root,
		"plugins/demo/skills/demo/SKILL.md",
		"---\nname: demo\ndescription: Does demo things\n---\n\nBody\n",
	);
	await put(root, "plugins/demo/bin/server", "#!/bin/sh\n");
	await put(root, "plugins/demo/mcp.json", {
		$schema: MCP_SCHEMA,
		mcpServers: {
			local: {
				type: "stdio",
				command: "./bin/server",
				args: ["--data", "${PLUGIN_DATA}/db"],
				env: { CACHE: "${PLUGIN_DATA}/cache" },
			},
			bare: { type: "stdio", command: "uvx" },
			remote: { type: "streamable-http", url: "https://example.com/mcp", headers: { "X-Tenant": "public" } },
			events: { type: "sse", url: "https://example.com/sse" },
		},
	});
	await build(root);
	const state = await mkdtemp(join(tmpdir(), "omp-drawer-consumer-"));
	track(state);
	await mkdir(join(state, "home"));
	return { root, state };
}

describe("generated catalogs in their consumers (skipped when the CLI is missing)", () => {
	test.skipIf(!Bun.which("codex"))(
		"codex lists the plugin from .agents/plugins/marketplace.json",
		async () => {
			const { root, state } = await consumerTree();
			// Codex keeps config and marketplace state in CODEX_HOME; the temp HOME hides personal marketplaces.
			const env = { CODEX_HOME: join(state, "codex") };
			await mkdir(env.CODEX_HOME);
			const add = await runIsolated(["codex", "plugin", "marketplace", "add", root, "--json"], state, env);
			expect({ code: add.code, stderr: add.stderr }).toEqual({ code: 0, stderr: "" });
			const list = await runIsolated(
				["codex", "plugin", "list", "--available", "--json", "--marketplace", "demo-market"],
				state,
				env,
			);
			expect({ code: list.code, stderr: list.stderr }).toEqual({ code: 0, stderr: "" });
			expect(object(JSON.parse(list.stdout)).available).toEqual([
				expect.objectContaining({
					pluginId: "demo@demo-market",
					version: "1.0.0",
					source: { source: "local", path: join(await realpath(root), "plugins/demo") },
					installPolicy: "AVAILABLE",
					authPolicy: "ON_INSTALL",
				}),
			]);
		},
		60_000,
	);

	test.skipIf(!Bun.which("claude"))(
		"claude plugin validate --strict passes the marketplace, the plugin and its .mcp.json",
		async () => {
			const { root, state } = await consumerTree();
			const env = { CLAUDE_CONFIG_DIR: join(state, "claude") };
			for (const target of [root, join(root, "plugins/demo")]) {
				const r = await runIsolated(["claude", "plugin", "validate", "--strict", "--json", target], state, env);
				const report = object(JSON.parse(r.stdout));
				const parts = [report.manifest, ...(Array.isArray(report.contents) ? report.contents : [])].map(object);
				const findings = parts.flatMap(part => [part.errors, part.warnings].flat());
				expect({ target, code: r.code, success: report.success, findings }).toEqual({
					target,
					code: 0,
					success: true,
					findings: [],
				});
			}
		},
		60_000,
	);

	test.skipIf(!Bun.which("claude"))(
		"claude runs the translated stdio server: command, args and env resolve; cwd is ignored and ${VAR} expands",
		async () => {
			const root = await tree(["claude"]);
			// The server records its working directory, arguments and two variables, then exits.
			await put(
				root,
				"plugins/demo/bin/server",
				'#!/bin/sh\nmkdir -p "$1" && { pwd; printf "%s\\n" "$@" "$MARK" "$HOMEVAR"; } >"$1/$3.txt"\n',
			);
			await chmod(join(root, "plugins/demo/bin/server"), 0o755);
			const args = ["${PLUGIN_DATA}", "${PLUGIN_ROOT}"];
			await put(root, "plugins/demo/mcp.json", {
				$schema: MCP_SCHEMA,
				mcpServers: {
					local: {
						type: "stdio",
						command: "./bin/server",
						args: [...args, "local"],
						env: { MARK: "${PLUGIN_DATA}/mark" },
					},
				},
			});
			await build(root);
			// What the build rejects for the claude host, added by hand to the generated file: a cwd and a ${VAR}.
			const generated = object(JSON.parse(await readFile(join(root, "plugins/demo/.mcp.json"), "utf8")));
			const servers = object(generated.mcpServers);
			const local = object(servers.local);
			const localArgs = Array.isArray(local.args) ? local.args : [];
			servers.rejected = {
				...local,
				args: [localArgs[0], localArgs[1], "rejected"],
				cwd: "${CLAUDE_PLUGIN_ROOT}/bin",
				env: { HOMEVAR: "${HOME}" },
			};
			await put(root, "plugins/demo/.mcp.json", generated);

			const state = await mkdtemp(join(tmpdir(), "omp-drawer-consumer-"));
			track(state);
			await mkdir(join(state, "home"));
			const env = { CLAUDE_CONFIG_DIR: join(state, "claude") };
			for (const cmd of [
				["claude", "plugin", "marketplace", "add", root],
				["claude", "plugin", "install", "demo@demo-market"],
				// Starts each server to check its health; the servers exit, so both report a failed connection.
				["claude", "mcp", "list"],
			]) {
				expect({ cmd, code: (await runIsolated(cmd, state, env)).code }).toEqual({ cmd, code: 0 });
			}
			const reports: Record<string, string[]> = {};
			for (const file of new Bun.Glob("plugins/data/*/*.txt").scanSync(env.CLAUDE_CONFIG_DIR)) {
				reports[basename(file, ".txt")] = (await readFile(join(env.CLAUDE_CONFIG_DIR, file), "utf8")).split("\n");
			}
			const project = await realpath(state);
			const pluginRoot = join(root, "plugins/demo");
			// ${CLAUDE_PLUGIN_DATA}: `<id>` is demo@demo-market with characters other than letters, digits, _ and - replaced by -.
			const data = join(env.CLAUDE_CONFIG_DIR, "plugins/data/demo-demo-market");
			// Claude Code runs plugin servers in the project directory, whatever cwd says, and expands ${HOME}.
			expect(reports).toEqual({
				local: [project, data, pluginRoot, "local", `${data}/mark`, "", ""],
				rejected: [project, data, pluginRoot, "rejected", "", join(state, "home"), ""],
			});
		},
		60_000,
	);

	test.skipIf(!Bun.which("omp"))(
		"omp discovers the plugin from .omp-plugin/marketplace.json",
		async () => {
			const { root, state } = await consumerTree();
			// omp keeps its state in HOME/.omp.
			const add = await runIsolated(["omp", "plugin", "marketplace", "add", root], state, {});
			expect(add.code).toBe(0);
			const discover = await runIsolated(["omp", "plugin", "discover"], state, {});
			expect(discover.code).toBe(0);
			expect(discover.stdout).toMatch(/^\s*demo@1\.0\.0\n\s*Demo plugin$/m);
		},
		60_000,
	);
});
