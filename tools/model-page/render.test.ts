// The "what the model sees" page: where each message is in the catalog, text shown as it is, and
// one block for the harnesses that got the same.
import { describe, expect, test } from "bun:test";
import { catalogLine, fenced, renderPage } from "./render";
import type { Seen } from "./types";

const CATALOG = `## The tool.

read = Read a journal.
    .session = The session's id
    .line = 1-based line

list-item = - { $id }
`;

const text = (label: string, value: string, ids: string[] = []): Seen => ({ kind: "text", label, text: value, ids });

describe("catalogLine", () => {
	test("finds a message and its attributes, and nothing for one the catalog lacks", () => {
		expect(catalogLine(CATALOG, "read")).toBe(3);
		expect(catalogLine(CATALOG, "read.line")).toBe(5);
		expect(catalogLine(CATALOG, "list-item")).toBe(7);
		expect(catalogLine(CATALOG, "read.find")).toBeUndefined();
		expect(catalogLine(CATALOG, "list")).toBeUndefined();
	});
});

describe("fenced", () => {
	test("keeps a text's own backticks inside the block", () => {
		expect(fenced("run `ls`")).toBe("```text\nrun `ls`\n```\n");
		expect(fenced("a ```js\nb\n``` c")).toBe("````text\na ```js\nb\n``` c\n````\n");
	});
});

describe("renderPage", () => {
	test("shows a text once for the harnesses that got it, each with its own label, and the messages it came from", () => {
		const page = renderPage({
			plugin: "demo",
			catalog: CATALOG,
			steps: [{ kind: "call", title: "A call", tool: "read", input: {} }],
			seen: {
				omp: [[text("the tool's result", "- 01a", ["list-item"])]],
				claude: [[text("the tool's result", "- 01a", ["list-item"])]],
				codex: [[text("a tool error", "bad line")]],
			},
		});
		expect(page).toContain(
			"### The tool's result in omp and Claude Code\n\n```text\n- 01a\n```\n\nFrom [`list-item`](../../plugins/demo/core/model.ftl#L7).\n",
		);
		expect(page).toContain("### A tool error in Codex / desktop apps\n\n```text\nbad line\n```\n");
		expect(page).toContain("| 1. A call | - 01a | - 01a | error: bad line |");
	});
});
