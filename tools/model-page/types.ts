// A plugin's scripted session for its "what the model sees" page (tools/model-page.ts), and what
// each harness's shell gives the model at each step of it.
import type { Register } from "claude-code";
import type { Operations } from "../../kit/core/operations";
import type { Parts } from "../../kit/program/cli";

export type Harness = "omp" | "claude" | "codex";

export const HARNESSES: readonly Harness[] = ["omp", "claude", "codex"];

/** One step of the session: its start, or a call of one of the plugin's tools. */
export type Step =
	| { readonly kind: "start"; readonly title: string }
	| {
			readonly kind: "call";
			readonly title: string;
			readonly tool: string;
			readonly input: Readonly<Record<string, unknown>>;
	  };

/** What the model gets at a step, with the catalog messages it is made of. */
export type Seen =
	| {
			readonly kind: "tool";
			readonly name: string;
			readonly description: string;
			readonly parameters: Readonly<Record<string, string>>;
			/** Where the harness keeps the tool: in every prompt, or behind tool search. */
			readonly shown: "always" | "on search";
			readonly ids: readonly string[];
	  }
	| {
			readonly kind: "text";
			/** What the text is, as the harness gives it: an answer, an error, a line in the chat. */
			readonly label: string;
			readonly text: string;
			readonly ids: readonly string[];
	  };

/** The session the scenario sets up, in a made-up home folder. */
export interface Setup {
	/** The folder the agent works in. */
	readonly project: string;
	/** The session the steps run in, in each harness, and its journal. */
	readonly sessions: Readonly<Record<Harness, { readonly id: string; readonly file: string }>>;
	/**
	 * The plugin's folder as the shells see it, when the scenario makes one under the home folder,
	 * with stand-ins for its native programs; else the plugin's own.
	 */
	readonly plugin?: string;
	/** When the session runs (an ISO time), for a plugin whose text depends on the time; else now. */
	readonly now?: string;
}

export interface Scenario {
	readonly plugin: string;
	/** Writes the files the session reads under `home`. */
	setup(home: string): Promise<Setup>;
	readonly steps: readonly Step[];
	/** The plugin's operations, when it has tools, and its copy of the catalog's trace (kit/core/model.ts). */
	readonly operations?: Operations;
	traceMessages<T>(run: () => Promise<T>): Promise<{ value: T; ids: string[] }>;
	/** The shells, as each harness loads them; a harness the plugin doesn't run in has none. */
	readonly shells: {
		/** The omp extension's default export, or one bound to the scenario's setup. */
		readonly omp?: (pi: never, setup: Setup) => void;
		/** The Claude Code mod's `register`. */
		readonly claude?: Register;
		/** The program's parts, as `runProgram` gets them. */
		readonly codex?: (setup: Setup) => Parts | Promise<Parts>;
	};
}
