// A computer for the installer's tests: a throwaway home, the agents a test says are here, and
// fake commands that keep their own state the way omp's, Claude Code's and Codex's do.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PayloadFile } from "./core/payload";
import { type Ctx, dirsFor } from "./steps/context";
import { pluginsOf } from "./steps/plugins";
import type { Agents, Ran, Sys } from "./system";

const bytes = (s: string) => new TextEncoder().encode(s);
const json = (path: string, value: unknown): PayloadFile => ({ path, mode: 0o644, data: bytes(JSON.stringify(value)) });

/** Two plugins: "piebird-search" with a program and a vault, for every agent; "piebird-notes", omp's only. */
export function payload(): PayloadFile[] {
	const settings = { settings: { mode: { type: "text", title: "Mode", about: "How", default: "" } } };
	return [
		json("catalog.json", {
			name: "piebird",
			plugins: [
				{ name: "piebird-search", category: "search", hosts: ["omp", "claude", "codex"], program: "search-vault" },
				{ name: "piebird-notes", category: "productivity", hosts: ["omp"] },
			],
		}),
		json(".claude-plugin/marketplace.json", { name: "piebird", plugins: [] }),
		json("plugins/piebird-search/plugin.json", {
			name: "piebird-search",
			version: "1.2.0",
			description: "Search things",
		}),
		json("plugins/piebird-search/core/settings.json", settings),
		{ path: "plugins/piebird-search/native/piebird-search", mode: 0o755, data: bytes("#!/bin/sh\n") },
		{ path: "plugins/piebird-search/native/macos-arm64/piebird-search", mode: 0o755, data: bytes("program") },
		json("plugins/piebird-notes/plugin.json", { name: "piebird-notes", version: "0.3.0", description: "Notes" }),
	];
}

type Command = (args: readonly string[]) => Ran;

export interface Computer {
	readonly ctx: Ctx;
	readonly home: string;
	/** Every command run, as [command name, ...args]. */
	readonly ran: string[][];
	cleanup(): void;
}

export const ok = (stdout = ""): Ran => ({ code: 0, stdout, stderr: "" });
export const failed = (stderr: string): Ran => ({ code: 1, stdout: "", stderr });

/** A computer with `agents` (commands by name, apps by path) and `commands` answering for them. */
export function computer(agents: Partial<Agents>, commands: Record<string, Command> = {}): Computer {
	const home = mkdtempSync(join(tmpdir(), "installer-home-"));
	const ran: string[][] = [];
	const sys: Sys = {
		platform: "darwin",
		home,
		env: {},
		exists: existsSync,
		async run(cmd) {
			const name = cmd[0]?.split("/").at(-1) ?? "";
			ran.push([name, ...cmd.slice(1)]);
			return commands[name]?.(cmd.slice(1)) ?? ok();
		},
	};
	const files = payload();
	const ctx: Ctx = {
		sys,
		agents: { apps: {}, ...agents },
		payload: files,
		plugins: pluginsOf(files),
		dirs: dirsFor(sys),
	};
	return { ctx, home, ran, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
