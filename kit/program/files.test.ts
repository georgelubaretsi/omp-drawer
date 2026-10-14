import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readIfThere, replaceFile } from "./files";

let dir = "";
afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});
const fresh = () => (dir = mkdtempSync(join(tmpdir(), "kit-files-")));
const modeOf = (path: string) => statSync(path).mode & 0o777;

describe("a person's settings file", () => {
	test("that isn't there reads as none; one that can't be read throws", () => {
		const file = join(fresh(), "settings.json");
		expect(readIfThere(file)).toBeUndefined();
		expect(readIfThere(join(file, "under-a-missing-file"))).toBeUndefined();
		writeFileSync(file, "{}");
		chmodSync(file, 0o000);
		expect(() => readIfThere(file)).toThrow("couldn't be read, so it was left as it is");
		chmodSync(file, 0o600);
		expect(readIfThere(file)).toBe("{}");
	});

	test("replaced keeps its permissions; a new one is created", () => {
		const file = join(fresh(), "deeper", "config.toml");
		replaceFile(file, "a = 1\n");
		expect(readFileSync(file, "utf8")).toBe("a = 1\n");
		chmodSync(file, 0o600);
		replaceFile(file, "a = 2\n");
		expect(readFileSync(file, "utf8")).toBe("a = 2\n");
		expect(modeOf(file)).toBe(0o600);
		chmodSync(file, 0o640);
		replaceFile(file, "a = 3\n");
		expect(modeOf(file)).toBe(0o640);
	});

	test("a file left beside it from before never gets the text, and nothing new is left", () => {
		const file = join(fresh(), "settings.json");
		writeFileSync(file, "{}");
		chmodSync(file, 0o600);
		const leftover = `${file}.${process.pid}.tmp`;
		writeFileSync(leftover, "stale");
		chmodSync(leftover, 0o644);
		replaceFile(file, '{"secret": "kept private"}');
		expect(readFileSync(leftover, "utf8")).toBe("stale");
		expect(readdirSync(dir).toSorted()).toEqual(["settings.json", `settings.json.${process.pid}.tmp`]);
		expect(modeOf(file)).toBe(0o600);
	});
});
