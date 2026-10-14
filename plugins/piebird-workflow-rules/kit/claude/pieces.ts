// A file read in pieces in a Claude Code mod (`Io.readPieces`, kit/core/io.ts): `$.fs.read` holds
// at most 4 MiB, so a bigger file is printed by a program the mod spawns and read as it comes. The
// hooks module makes the `$` calls (kit/claude/io-of.md); this turns what they give into pieces.
// The build copies kit/ into each plugin that needs it (plugins/<name>/kit/); edit it in kit/.

/**
 * Files below this size are read with `$.fs.read`. It refuses one over 4 MiB, and a file may grow
 * between the size check and the read (an agent's own journal does), hence the margin.
 */
export const FS_READ_LIMIT = 3 * 1024 * 1024;

/** What `$.process.spawn` gives: the program's output in pieces, then how it ended. */
export interface Spawned extends AsyncIterable<{ readonly stream: "stdout" | "stderr"; readonly text: string }> {
	readonly result: Promise<{ readonly code: number | null; readonly signal: string | null }>;
}

/** A program to spawn: its command line and the variables set for it. */
export interface Printer {
	readonly argv: readonly string[];
	readonly env?: Readonly<Record<string, string>>;
}

/** Where the Windows printer finds its file: a variable, which no shell parses. */
const FILE_VARIABLE = "PIEBIRD_PRINT_FILE";

/** PowerShell copying the file's bytes to standard output as they are. */
const COPY_TO_STDOUT = `$f=[IO.File]::OpenRead($env:${FILE_VARIABLE});$o=[Console]::OpenStandardOutput();$f.CopyTo($o);$o.Flush();$f.Close()`;

/**
 * The program that prints a file on this system: `cat`, or PowerShell on Windows. The path may
 * come from the model, so on Windows it goes in a variable: on cmd's command line, a file named
 * `x&calc&.jsonl` would run calc.
 */
export function printerOf(path: string, windows: boolean): Printer {
	if (!windows) return { argv: ["cat", path] };
	return {
		argv: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", COPY_TO_STDOUT],
		env: { [FILE_VARIABLE]: path },
	};
}

/**
 * The program's standard output in pieces as it writes them. Leaving the loop early stops the
 * program; one that fails throws with what it wrote to standard error.
 */
export async function* stdoutPieces(spawned: Spawned, printer: Printer): AsyncGenerator<string> {
	let stderr = "";
	for await (const piece of spawned) {
		if (piece.stream === "stdout") yield piece.text;
		else stderr += piece.text;
	}
	const { code, signal } = await spawned.result;
	if (code !== 0) throw new Error(`${printer.argv[0]} failed (${signal ?? `exit ${code}`}): ${stderr.trim()}`);
}
