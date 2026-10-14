// What piebird-sessions's program works with: the session_read tool, and Codex's SessionStart
// hook, which tells the agent its own session.
import type { Parts } from "../kit/program/cli";
import { homedir } from "node:os";
import { rootsOf } from "../core/lookup";
import { operations } from "../core/operations.gen";
import { readHandler } from "../core/read";
import { selfLine } from "../core/self";
import { bunIo } from "../kit/bun/io";
import { addContext, allow } from "../kit/program/hook";
import manifest from "../plugin.json" with { type: "json" };

export const NAME = manifest.name;

export function parts(): Parts {
	const home = homedir();
	const { CLAUDE_CONFIG_DIR, CODEX_HOME } = process.env;
	const roots = rootsOf(home, { CLAUDE_CONFIG_DIR, CODEX_HOME });
	// Codex and the desktop apps start it in the plugin's folder and don't say the project: the list
	// shows every agent's sessions.
	const list = { kind: "all" as const, roots };
	return {
		name: manifest.name,
		version: manifest.version,
		operations,
		handlers: { read: readHandler(bunIo(), { roots: [roots.omp, roots.claude, roots.codex], list, home }) },
		async hook(input) {
			if (input.hookEventName !== "SessionStart" || input.transcriptPath === undefined) return allow();
			return addContext(selfLine({ id: input.sessionId, file: input.transcriptPath }, home), "SessionStart");
		},
	};
}
