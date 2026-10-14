import { describe, expect, test } from "bun:test";
import { type Declared, parseDeclared } from "./declared";

const about = { title: "Mode", about: "How much." };

function refused(settings: unknown): () => Declared {
	return () => parseDeclared(JSON.stringify({ settings }));
}

describe("parseDeclared", () => {
	test("reads each kind of setting and the secrets", () => {
		const source: Declared = {
			settings: {
				mode: { type: "choice", ...about, default: "a", choices: [{ value: "a", label: "A", means: "First." }] },
				folder: { type: "path", ...about, default: ".threads" },
			},
			secrets: { token: { title: "Token", about: "Signs in.", env: "DEMO_TOKEN" } },
		};
		expect(parseDeclared(JSON.stringify(source))).toEqual(source);
		expect(parseDeclared("{}")).toEqual({ settings: {}, secrets: {} });
	});

	test("refuses a shape the code can't use, naming where", () => {
		expect(refused({ mode: { type: "toggle", ...about, default: "a" } })).toThrow(
			"settings.json: /settings/mode/type is no kind of setting",
		);
		expect(refused({ mode: { type: "choice", ...about, default: "a", choices: "a" } })).toThrow(
			"settings.json: /settings/mode/choices isn't a list",
		);
		expect(refused({ mode: { type: "text", ...about, default: 1 } })).toThrow(
			"settings.json: /settings/mode/default isn't text",
		);
	});
});
