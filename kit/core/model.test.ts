import { describe, expect, test } from "bun:test";
import { Catalog, joinText, traceMessages } from "./model";

const SOURCE = `greet = Hello, { $name }.
count = { $n ->
    [one] one result
   *[other] { $n } results
}
tool =
    .short = The short form.
plain = Plain.
`;

const catalog = new Catalog<{
	greet: { name: string };
	count: { n: number };
	"tool.short": undefined;
	plain: undefined;
}>(SOURCE);

/** Types out of date with the source: the runtime still refuses. */
const stale = new Catalog<{
	greet: undefined;
	missing: undefined;
	"plain.gone": undefined;
}>(SOURCE);

describe("Catalog", () => {
	test("fills variables without bidi isolation marks around them", () => {
		expect(catalog.text("greet", { name: "Ada" }).text).toBe("Hello, Ada.");
	});

	test("picks the plural form", () => {
		expect([1, 2].map(n => catalog.text("count", { n }).text)).toEqual(["one result", "2 results"]);
	});

	test("writes numbers as they are, without the locale's grouping", () => {
		expect(catalog.text("count", { n: 20000 }).text).toBe("20000 results");
	});

	test("a trace gives the messages formatted while it runs, each once, and only those", async () => {
		catalog.text("plain");
		const { value, ids } = await traceMessages(async () =>
			joinText([
				catalog.text("greet", { name: "Ada" }),
				catalog.text("tool.short"),
				catalog.text("greet", { name: "Bo" }),
			]),
		);
		catalog.text("plain");
		expect(value.text).toBe("Hello, Ada.\nThe short form.\nHello, Bo.");
		expect(ids).toEqual(["greet", "tool.short"]);
	});

	test("reads an attribute as id.attribute", () => {
		expect(catalog.text("tool.short").text).toBe("The short form.");
	});

	test("refuses where Fluent would print a placeholder", () => {
		expect(() => stale.text("greet")).toThrow("message greet: Unknown variable: $name");
		expect(() => stale.text("missing")).toThrow("no message missing in the catalog");
		expect(() => stale.text("plain.gone")).toThrow("message plain.gone has no such attribute");
	});

	test("an id that arrives at run time gets the same text, and the same refusals", () => {
		expect(catalog.textById("greet", { name: "Ada" }).text).toBe("Hello, Ada.");
		expect(() => catalog.textById("greet", { nom: "Ada" })).toThrow("message greet: Unknown variable: $name");
		expect(() => catalog.textById("vanished")).toThrow("no message vanished in the catalog");
	});

	test("refuses a catalog with an id twice", () => {
		expect(() => new Catalog("a = One\na = Two\n")).toThrow('Attempt to override an existing message: "a"');
	});
});

// Checked by tsc: the catalog's type turns a wrong id or variable into a compile error.
export function typeChecks(): void {
	// @ts-expect-error an id the catalog doesn't have
	catalog.text("nope");
	// @ts-expect-error a message's variables are required
	catalog.text("greet");
	// @ts-expect-error each variable it uses
	catalog.text("greet", {});
	// @ts-expect-error and none it doesn't
	catalog.text("plain", { name: "x" });
}
