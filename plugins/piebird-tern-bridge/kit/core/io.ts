// What a shell lends core code that needs the outside world: reading a file, whole or in pieces,
// listing a folder and running a program. Each shell makes one from its own API (kit/bun: Bun; a
// Claude Code mod: `$`, in its hooks module, where `$` calls must stay), so the code that uses it
// stays pure.
import type { CallSignal } from "./operations";

export interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export interface RunOptions {
	/** Written to the program's stdin, then closed. */
	readonly stdin?: string;
	readonly timeoutMs?: number;
	/** The program is killed when it aborts: the call that started it was cancelled. */
	readonly signal?: CallSignal;
}

/** One entry of a folder. */
export interface IoEntry {
	readonly name: string;
	readonly directory: boolean;
	/** A file's last modification, milliseconds since the epoch; 0 for anything else. */
	readonly modified: number;
}

export interface Io {
	/** The file's text; undefined when there is no such file. Other failures throw. */
	readText(path: string): Promise<string | undefined>;
	/**
	 * The file's text in pieces as it is read, for a file too big to hold at once or read only in
	 * part: reading starts with the first piece asked for, and leaving the loop early stops it.
	 * Undefined when there is no such file; other failures throw while reading.
	 */
	readPieces(path: string): Promise<AsyncIterable<string> | undefined>;
	/** The folder's entries; undefined when there is no such folder. Other failures throw. */
	list(path: string): Promise<readonly IoEntry[] | undefined>;
	/** Runs argv[0] with the rest as arguments, without a shell. */
	run(argv: readonly string[], options?: RunOptions): Promise<RunResult>;
}

/** Where the shell runs: the folders core code may need, as absolute paths. */
export interface Place {
	/** The person's home folder. */
	readonly home: string;
	/** The project the agent works in; settings files and paths in them are relative to it. */
	readonly project: string;
	/** The plugin's own folder, where it is installed. */
	readonly plugin: string;
}
