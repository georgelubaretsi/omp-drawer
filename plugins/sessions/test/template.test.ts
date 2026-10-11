import { describe, expect, test } from "bun:test";
import { Template } from "../src/template";

describe("a template", () => {
	const template = new Template(
		'---\nlabel: "[{{kind}}]"\n---\n{{#each items}}\n{{name}}{{#if note}} ({{note}}){{/if}}\n{{/each}}\n',
	);

	test("fills its body and its texts, an absent value given as undefined", () => {
		expect(
			template.render({
				items: [
					{ name: "a", note: undefined },
					{ name: "b", note: "x" },
				],
			}),
		).toBe("a\nb (x)");
		expect(template.text("label", { kind: "k" })).toBe("[k]");
	});

	test("refuses a name its values lack, at any depth, and a text it doesn't have", () => {
		expect(() => template.render({ items: [{ name: "a" }] })).toThrow(
			"template uses items.0.note, which has no value",
		);
		expect(() => template.render({})).toThrow("template uses items, which has no value");
		expect(() => template.text("label")).toThrow("template uses kind, which has no value");
		expect(() => template.text("kinds")).toThrow('template has no text "kinds"');
	});

	test("refuses, when it loads, a value named like a Handlebars helper, in its body or its texts", () => {
		expect(() => new Template("default {{default}}s")).toThrow(
			"template value {{default}} has a Handlebars helper's name",
		);
		expect(() => new Template('---\nlabel: "{{join}}"\n---\nbody')).toThrow("template value {{join}}");
		expect(new Template("{{defaultSeconds}} s").render({ defaultSeconds: 130 })).toBe("130 s");
	});
});
