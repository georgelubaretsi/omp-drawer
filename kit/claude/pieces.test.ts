// The program a mod spawns to print a big file: the path, which may come from the model, never
// reaches a command line a shell parses.
import { describe, expect, test } from "bun:test";
import { printerOf } from "./pieces";

const NAMES = [
	String.raw`C:\tmp\x&calc&.jsonl`,
	String.raw`C:\tmp\a|b^c%PATH%"d".jsonl`,
	String.raw`C:\tmp\$(calc);'e'.jsonl`,
];

describe("printing a file on Windows", () => {
	test.each(NAMES)("%s goes in a variable, not on the command line", name => {
		const printer = printerOf(name, true);
		expect(printer.argv.some(arg => arg.includes(name) || arg.includes("calc"))).toBe(false);
		expect(Object.values(printer.env ?? {})).toEqual([name]);
	});
});
