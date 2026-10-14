// The Io of the shells that run on Bun: the omp extension and the program.
import type { Io, IoEntry, RunOptions, RunResult } from "../core/io";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:os";

function missing(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

/** The file's text; undefined when there is no such entry or a parent isn't a folder. */
async function readText(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (missing(error)) return undefined;
		throw error;
	}
}

async function* pieces(path: string): AsyncGenerator<string> {
	// Leaving the loop early ends this generator, which destroys the stream and closes the file.
	for await (const piece of createReadStream(path, { encoding: "utf8" })) yield String(piece);
}

/** The file's text in pieces; the file is opened at the first piece, so one never read stays shut. */
async function readPieces(path: string): Promise<AsyncIterable<string> | undefined> {
	try {
		await stat(path);
	} catch (error) {
		if (missing(error)) return undefined;
		throw error;
	}
	return pieces(path);
}

/** The folder's entries. A link isn't followed, so it never counts as a folder, nor as a file. */
async function list(path: string): Promise<readonly IoEntry[] | undefined> {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return await Promise.all(
			entries.map(async e => ({
				name: e.name,
				directory: e.isDirectory(),
				modified: e.isFile() ? (await lstat(`${path}/${e.name}`)).mtimeMs : 0,
			})),
		);
	} catch (error) {
		if (missing(error)) return undefined;
		throw error;
	}
}

/**
 * Runs argv without a shell. A run past `timeoutMs`, or whose `signal` aborts, is killed with
 * SIGKILL, and a program killed by a signal exits as a shell reports it, 128 + the signal: 137 for
 * a timeout. A program that can't be started throws, as does one whose signal aborted before it.
 */
async function run(argv: readonly string[], options: RunOptions = {}): Promise<RunResult> {
	const proc = Bun.spawn([...argv], {
		stdin: options.stdin === undefined ? "ignore" : new TextEncoder().encode(options.stdin),
		stdout: "pipe",
		stderr: "pipe",
		killSignal: "SIGKILL",
		...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
		// Every caller's signal is the platform's AbortSignal; core only names what it reads of it.
		...(options.signal instanceof AbortSignal ? { signal: options.signal } : {}),
	});
	const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	await proc.exited;
	const signal = proc.signalCode === null ? 0 : constants.signals[proc.signalCode];
	return { exitCode: proc.exitCode ?? 128 + signal, stdout, stderr };
}

export function bunIo(): Io {
	return { readText, readPieces, list, run };
}
