// The Claude Code part (com.anthropic.claudecode/), checked by Claude Code itself when it is
// installed, with its state in a temp folder: `claude plugin validate` reads the plugin and its mod
// as a session would, and `claude plugin test` runs the mod's own tests in Claude Code's engine. Both
// run on a copy of the plugin's Claude Code files: on the plugin's folder the engine would also run
// these Bun tests, and given the part's folder it refuses the mod's imports of core/ and kit/.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = join(import.meta.dir, "..");
const state = mkdtempSync(join(tmpdir(), "kagi-claude-"));
const plugin = join(state, "piebird-kagi-search");
afterAll(() => rmSync(state, { recursive: true, force: true }));
beforeAll(() => {
	for (const part of [".claude-plugin", "com.anthropic.claudecode", "core", "kit"])
		cpSync(join(SOURCE, part), join(plugin, part), { recursive: true });
});

/** Runs `claude` in the copy with HOME and Claude Code's config in the temp folder. */
function claude(...args: string[]): { code: number; output: string } {
	const run = Bun.spawnSync(["claude", ...args], {
		cwd: plugin,
		env: { PATH: process.env.PATH ?? "", TMPDIR: tmpdir(), HOME: state, CLAUDE_CONFIG_DIR: join(state, "claude") },
		stdin: "ignore",
		timeout: 60_000,
	});
	return { code: run.exitCode, output: `${run.stdout.toString()}${run.stderr.toString()}` };
}

describe.skipIf(!Bun.which("claude"))("the Claude Code part", () => {
	test("claude plugin validate loads the mod from the manifest's hooks file", () => {
		const { code, output } = claude("plugin", "validate", "--strict", ".");
		expect(output).toContain("com.anthropic.claudecode/hooks/hooks.json");
		expect(output).toContain("./register.ts hooks: ");
		expect(output).toContain("tool.describe{tool=WebSearch}");
		expect(code).toBe(0);
	});

	test("its tests pass in Claude Code's engine", () => {
		const { code, output } = claude("plugin", "test", ".");
		expect(output).toContain(" 0 fail");
		expect(code).toBe(0);
	});
});
