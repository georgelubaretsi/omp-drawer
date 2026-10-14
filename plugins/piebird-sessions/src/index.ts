// The sessions plugin in omp: the session_read tool, and a line before the main agent's prompt,
// shown in the chat, that names its own session.
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { homedir } from "node:os";
import { rootsOf } from "../core/lookup";
import { operations } from "../core/operations.gen";
import { readHandler } from "../core/read";
import { isNewIn, SELF_TYPE, selfLine } from "../core/self";
import { bunIo } from "../kit/bun/io";
import { registerOperations } from "../kit/omp/tools";

export default function sessions(pi: ExtensionAPI): void {
	const io = bunIo();
	const home = homedir();
	const { CLAUDE_CONFIG_DIR, CODEX_HOME } = process.env;
	const { omp, claude, codex } = rootsOf(home, { CLAUDE_CONFIG_DIR, CODEX_HOME });
	pi.setLabel("Sessions");

	registerOperations(pi, operations, (ctx: ExtensionContext) => {
		// omp may keep this session's journals outside its usual folder (--session-dir, a profile).
		const folder = ctx.sessionManager.getSessionDir();
		const current = ctx.sessionManager.getSessionFile();
		const list = { kind: "folder" as const, folder, ...(current === undefined ? {} : { current }) };
		const roots = [omp, claude, codex, ...(folder.startsWith(`${omp}/`) ? [] : [folder])];
		return { read: readHandler(io, { roots, list, home }) };
	});

	pi.on("before_agent_start", (_event, ctx) => {
		const manager = ctx.sessionManager;
		const file = manager.getSessionFile();
		if (ctx.agent.kind !== "main" || file === undefined) return undefined;
		const parent = manager.getHeader()?.parentSession;
		const line = selfLine({ id: manager.getSessionId(), file, ...(parent === undefined ? {} : { parent }) }, home);
		if (!isNewIn(line, manager.getBranch())) return undefined;
		return { message: { customType: SELF_TYPE, content: line.text, display: true } };
	});
}
