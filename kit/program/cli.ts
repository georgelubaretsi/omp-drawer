// The program's commands: `mcp` serves the plugin's tools, `hook` answers a Codex hook, `call`
// performs one operation for a person or a script, `settings` opens the person's settings page.
// The program's main.ts says what they work with; this only reads the command line and wires
// stdin and stdout.
import type { Declared } from "../core/declared";
import type { HookAnswer, HookInput } from "./hook";
import type { McpOptions } from "./mcp";
import { readHookInput } from "./hook";
import { serveMcp } from "./mcp";
import { runSettingsPage } from "./settings";

/** The agent's own settings screen, by key, as `-agent key=value` passes it. */
export type AgentChoices = Readonly<Record<string, string>>;

export interface Parts extends McpOptions {
	/** Answers a Codex hook event; a program without hooks has none. */
	readonly hook?: (input: HookInput) => Promise<HookAnswer>;
}

export interface Program {
	/** The program's command name, for its usage message. */
	readonly name: string;
	/**
	 * What the commands work with, made once the command line is read. `agent` holds the
	 * `-agent key=value` choices of a host whose own settings screen feeds the server's arguments,
	 * as the `.mcpb` for Claude chat will pass its user_config; Codex passes none.
	 */
	readonly parts: (agent: AgentChoices) => Promise<Parts>;
	/** The plugin's declared settings, for the settings page; none when it has none. */
	readonly settings?: Declared;
}

interface Command {
	readonly name: string;
	readonly args: readonly string[];
	readonly agent: AgentChoices;
}

/** A command line the program doesn't take: exit 2 with the usage message. */
class UsageError extends Error {}

function usage(name: string): string {
	return [
		`Usage: ${name} <command> [-agent key=value]...`,
		"",
		"Commands:",
		"  mcp               serve the plugin's tools over MCP on stdin and stdout",
		"  hook              answer the Codex hook event on stdin",
		"  call <operation>  perform an operation, its input as JSON on stdin; prints",
		'                    {"output": ...} or {"error": {"id": ..., "text": ...}}',
		"  settings          open your settings for this plugin in the browser",
		"",
	].join("\n");
}

function parse(argv: readonly string[]): Command {
	const [name = "", ...rest] = argv;
	const args: string[] = [];
	const agent: Record<string, string> = {};
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i] ?? "";
		if (arg !== "-agent" && arg !== "--agent") {
			args.push(arg);
			continue;
		}
		const choice = rest[++i] ?? "";
		const eq = choice.indexOf("=");
		if (eq < 1) throw new UsageError(`-agent takes key=value, not "${choice}"`);
		agent[choice.slice(0, eq)] = choice.slice(eq + 1);
	}
	return { name, args, agent };
}

function expectArgs(command: Command, count: number): void {
	if (command.args.length !== count)
		throw new UsageError(`${command.name} takes ${count === 0 ? "no" : count} argument${count === 1 ? "" : "s"}`);
}

async function call(parts: Parts, operation: string): Promise<void> {
	const handler = parts.handlers[operation];
	if (handler === undefined) {
		const known = Object.keys(parts.handlers).toSorted().join(", ");
		throw new UsageError(`no operation ${operation}; the operations: ${known}`);
	}
	const input: unknown = JSON.parse(await Bun.stdin.text());
	const outcome = await handler(input);
	const reply = outcome.ok ? { output: outcome.data } : { error: { id: outcome.error, text: outcome.text.text } };
	process.stdout.write(`${JSON.stringify(reply)}\n`);
}

async function hook(parts: Parts): Promise<void> {
	if (parts.hook === undefined) throw new UsageError("this program answers no hooks");
	const answer = await parts.hook(readHookInput(await Bun.stdin.text()));
	process.stdout.write(answer.stdout);
	process.exitCode = answer.exitCode;
}

async function dispatch(program: Program, command: Command): Promise<void> {
	switch (command.name) {
		case "mcp":
			expectArgs(command, 0);
			// Serves until the client closes stdin; then nothing keeps the process alive.
			serveMcp(await program.parts(command.agent));
			return;
		case "hook":
			expectArgs(command, 0);
			return hook(await program.parts(command.agent));
		case "call":
			expectArgs(command, 1);
			return call(await program.parts(command.agent), command.args[0] ?? "");
		case "settings":
			expectArgs(command, 0);
			if (!program.settings) throw new UsageError("this plugin has no settings");
			return runSettingsPage([{ name: program.name, declared: program.settings }]);
		default:
			throw new UsageError(command.name === "" ? "no command" : `no command ${command.name}`);
	}
}

/**
 * Runs the command in `argv` (the arguments after the program's own path) and sets the exit
 * status: 0 when it ran, 2 for a command line it doesn't take, 1 when it failed. `--help` prints
 * the usage message.
 */
export async function runProgram(argv: readonly string[], program: Program): Promise<void> {
	const [first] = argv;
	if (first === "--help" || first === "-h" || first === "help") {
		process.stdout.write(usage(program.name));
		return;
	}
	try {
		await dispatch(program, parse(argv));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${program.name}: ${message}\n`);
		if (error instanceof UsageError) process.stderr.write(usage(program.name));
		process.exitCode = error instanceof UsageError ? 2 : 1;
	}
}
