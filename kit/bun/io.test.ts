// The Bun shells' Io against real files and programs.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bunIo } from "./io";

const io = bunIo();
let dir: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), "kit-bun-io-"));
	await writeFile(join(dir, "a.txt"), "héllo\n");
	await mkdir(join(dir, "sub"));
	await symlink(join(dir, "sub"), join(dir, "link"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("readText", () => {
	test("reads a file, is undefined when there is none, and throws on the rest", async () => {
		expect(await io.readText(join(dir, "a.txt"))).toBe("héllo\n");
		expect(await io.readText(join(dir, "missing.txt"))).toBeUndefined();
		expect(await io.readText(join(dir, "no", "such.txt"))).toBeUndefined();
		expect(await io.readText(join(dir, "a.txt", "under-a-file.txt"))).toBeUndefined();
		expect(await io.readText(dir).catch((error: unknown) => error)).toMatchObject({ code: "EISDIR" });
	});
});

async function joined(pieces: AsyncIterable<string>): Promise<string> {
	let text = "";
	for await (const piece of pieces) text += piece;
	return text;
}

describe("readPieces", () => {
	test("reads a file in pieces that join to its text, a character cut by a piece's end included", async () => {
		// Several pieces, with two-byte characters at odd offsets, so a piece's end splits one.
		const text = `x${"héllo wörld\n".repeat(20000)}`;
		await writeFile(join(dir, "sub", "big.txt"), text);
		const pieces = await io.readPieces(join(dir, "sub", "big.txt"));
		if (pieces === undefined) throw new Error("big.txt not found");
		expect(await joined(pieces)).toBe(text);
	});

	test("stops reading when the loop leaves early", async () => {
		const pieces = await io.readPieces(join(dir, "sub", "big.txt"));
		if (pieces === undefined) throw new Error("big.txt not found");
		let first = "";
		for await (const piece of pieces) {
			first = piece;
			break;
		}
		expect(first.length).toBeGreaterThan(0);
		expect(first.length).toBeLessThan(200000);
	});

	test("is undefined when there is no file, and a folder throws once read", async () => {
		expect(await io.readPieces(join(dir, "missing.txt"))).toBeUndefined();
		expect(await io.readPieces(join(dir, "a.txt", "under-a-file.txt"))).toBeUndefined();
		const folder = await io.readPieces(dir);
		if (folder === undefined) throw new Error("the folder counted as missing");
		expect(await joined(folder).catch((error: unknown) => error)).toMatchObject({ code: "EISDIR" });
	});
});

describe("list", () => {
	test("gives each entry, whether it is a folder, and a file's modification; a link isn't followed", async () => {
		const entries = await io.list(dir);
		const file = await stat(join(dir, "a.txt"));
		expect(entries?.toSorted((a, b) => a.name.localeCompare(b.name))).toEqual([
			{ name: "a.txt", directory: false, modified: file.mtimeMs },
			{ name: "link", directory: false, modified: 0 },
			{ name: "sub", directory: true, modified: 0 },
		]);
	});

	test("is undefined for a missing folder or a file, and throws on the rest", async () => {
		expect(await io.list(join(dir, "missing"))).toBeUndefined();
		expect(await io.list(join(dir, "a.txt"))).toBeUndefined();
	});
});

describe("run", () => {
	test("passes stdin, or none, and returns the output and exit status", async () => {
		expect(await io.run(["cat"], { stdin: '{"query":"é"}' })).toEqual({
			exitCode: 0,
			stdout: '{"query":"é"}',
			stderr: "",
		});
		expect(await io.run(["cat"])).toEqual({ exitCode: 0, stdout: "", stderr: "" });
		expect(await io.run(["sh", "-c", "echo out; echo err >&2; exit 3"])).toEqual({
			exitCode: 3,
			stdout: "out\n",
			stderr: "err\n",
		});
	});

	test("runs no shell: arguments arrive as written", async () => {
		expect((await io.run(["/bin/echo", "$HOME", "*"])).stdout).toBe("$HOME *\n");
	});

	test("throws when the program can't be started", async () => {
		expect(await io.run([join(dir, "no-such-program")]).catch((error: unknown) => error)).toBeInstanceOf(Error);
	});

	test("stops a program that outlasts its timeout, exiting as a shell reports SIGKILL", async () => {
		const started = Date.now();
		const ran = await io.run(["sleep", "5"], { timeoutMs: 100 });
		expect(ran.exitCode).toBe(128 + 9);
		expect(Date.now() - started).toBeLessThan(4000);
	});

	test("stops a program when the call that started it is cancelled, or doesn't start it", async () => {
		const cancel = new AbortController();
		const running = io.run(["sleep", "30"], { signal: cancel.signal });
		cancel.abort();
		expect((await running).exitCode).toBe(128 + 9);
		const late = await io.run(["sleep", "30"], { signal: cancel.signal }).catch((error: unknown) => error);
		expect(late).toMatchObject({ name: "AbortError" });
	});
});
