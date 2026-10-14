// The part of Claude Code's mod API (the "claude-code" module a hooks module imports) that the kit
// and the plugins' hooks modules use, declared from its documentation, so a plugin typechecks
// without Claude Code installed. Claude Code's own declarations, written into a mod's
// .claude-plugin/types/ when it loads with --plugin-dir, are the reference: this stays a subset of
// them. The build copies kit/ into each plugin that needs it (plugins/<name>/kit/); edit it in kit/.
declare module "claude-code" {
	export interface FsEntry {
		readonly name: string;
		readonly kind: "file" | "dir" | "other";
		readonly size: number;
		readonly mtimeMs: number;
		readonly isLink: boolean;
	}

	export interface ProcessRunResult {
		readonly exitCode: number;
		readonly stdout: string;
		readonly stderr: string;
		readonly isStdoutTruncated: boolean;
		readonly isStderrTruncated: boolean;
	}

	export interface ProcessSpawnChunk {
		readonly stream: "stdout" | "stderr";
		readonly text: string;
	}

	export interface ProcessSpawnResult {
		readonly code: number | null;
		readonly signal: string | null;
	}

	export type HookStream<C, R> = AsyncGenerator<C, R> & { readonly result: Promise<R> };

	export interface ToolSpec {
		readonly name: string;
		readonly description: string;
		readonly inputSchema: Readonly<Record<string, unknown>>;
		readonly isDeferred?: boolean;
	}

	/** `$`: what a hook calls on Claude Code. */
	export interface Api {
		readonly fs: {
			read(path: string): Promise<string>;
			exists(path: string): Promise<boolean>;
			stat(path: string): Promise<{ readonly kind: "file" | "dir" | "other"; readonly size: number }>;
			list(path?: string): Promise<FsEntry[]>;
		};
		readonly process: {
			run(
				argv: readonly string[],
				init?: { readonly cwd?: string; readonly stdin?: string; readonly timeoutMs?: number },
			): Promise<ProcessRunResult>;
			spawn(request: {
				readonly argv: readonly string[];
				readonly cwd?: string;
				readonly env?: Readonly<Record<string, string>>;
				readonly input?: string;
			}): HookStream<ProcessSpawnChunk, ProcessSpawnResult>;
		};
		readonly env: { get(name: string): Promise<string | undefined> };
		readonly session: {
			/** The project root: where the session started, or where `/cd` took it. */
			root(): Promise<string>;
			cwd(): Promise<string>;
			/** The session's id, its transcript file's name. */
			id(): Promise<string>;
		};
		/** The folder holding the plugin's .claude-plugin/plugin.json. */
		readonly plugin: { readonly root: string };
		readonly tool: { register(spec: ToolSpec): Promise<unknown> };
		/** Asks the engine to compute a cached event again, such as tool.describe's answers. */
		readonly ui: { invalidate(event: "tool.describe" | "prompt.context"): void };
	}

	export interface PromptContextBlock {
		readonly name: string;
		readonly text: string;
	}

	/** Each event the declarations cover: what a hook gets (`e`) and what it answers. */
	export interface Events {
		"session.start": {
			readonly input: { readonly cwd: string; readonly surface: unknown; readonly isInteractive: boolean };
			readonly result: { readonly cwd: string };
		};
		/** The conversation ends: the session ends, or `/clear`, `/resume` or `/branch` runs. */
		"session.end": {
			readonly input: { readonly reason: string; readonly sessionId?: string };
			readonly result: { readonly sessionId: string };
		};
		"prompt.context": {
			readonly input: { readonly blocks: readonly PromptContextBlock[] };
			readonly result: { readonly blocks: readonly PromptContextBlock[] };
		};
		"tool.call": {
			readonly input: { readonly tool: string; readonly tool_use_id?: string; readonly [argument: string]: unknown };
			readonly result: { readonly result: unknown } | { readonly deny: string };
		};
		/** A tool's description as the engine is about to send it; `isDeferred` when it waits behind tool search. */
		"tool.describe": {
			readonly input: {
				readonly tool: string;
				readonly description: string;
				readonly isDeferred?: true;
				readonly provider: { readonly plugin: string; readonly tier: string };
			};
			/** `isDeferred` true puts the tool behind tool search, false in the prompt's list. */
			readonly result: { readonly description: string; readonly isDeferred?: boolean };
		};
		// A call on `$` is an event too, answered with `{ value }`: a test's hooks answer them.
		"env.get": { readonly input: { readonly name: string }; readonly result: { readonly value: string | undefined } };
		"session.root": { readonly input: Readonly<Record<string, never>>; readonly result: { readonly value: string } };
		"fs.read": { readonly input: { readonly path: string }; readonly result: { readonly value: string } };
		"fs.exists": { readonly input: { readonly path: string }; readonly result: { readonly value: boolean } };
		"process.run": {
			readonly input: { readonly argv: readonly string[]; readonly stdin?: string };
			readonly result: { readonly value: ProcessRunResult };
		};
	}

	export type Hook<K extends keyof Events> = (
		$: Api,
		e: Events[K]["input"],
		next: (e: Events[K]["input"]) => Promise<Events[K]["result"]>,
	) => Events[K]["result"] | Promise<Events[K]["result"]>;

	export interface On {
		<K extends keyof Events>(event: K, hook: Hook<K>): unknown;
		<K extends keyof Events>(
			event: K,
			matcher: Readonly<Record<string, string | readonly string[]>>,
			hook: Hook<K>,
		): unknown;
	}

	/** A hooks module's `register` export; `options` holds the person's choices for the plugin. */
	export type Register = (
		on: On,
		options: Readonly<Record<string, string | number | boolean | readonly string[]>>,
	) => unknown;
}

/** The test kit: `claude plugin test` runs a mod's tests in Claude Code's engine. */
declare module "claude-code/testing" {
	import type { Events, On } from "claude-code";

	type Call<K extends keyof Events> = (e: Events[K]["input"]) => Promise<Events[K]["result"]>;

	/** The engine's `$` in a test: each call fires its event through the plugins, then the test's hooks. */
	export interface Engine {
		readonly tool: { readonly call: Call<"tool.call">; readonly describe: Call<"tool.describe"> };
		readonly prompt: { readonly context: Call<"prompt.context"> };
		readonly session: { readonly end: Call<"session.end"> };
	}

	/** A test: `on` registers hooks beneath every plugin, answering in Claude Code's place. */
	export const test: (name: string, body: ($: Engine, on: On) => unknown) => void;
	export const describe: (name: string, body: () => void) => void;
	export const expect: (actual: unknown) => {
		toEqual(expected: unknown): void;
		toBe(expected: unknown): void;
		toMatchObject(expected: unknown): void;
	};
}
