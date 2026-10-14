// A plugin's "what the model sees" page, from what each harness's shell gave the model at each
// step of its scripted session: a table of the steps, then each step's texts in full, once for the
// harnesses that got the same, each with the catalog messages it is made of.
import { type Harness, HARNESSES, type Seen, type Step } from "./types";

export interface Recording {
	readonly plugin: string;
	readonly steps: readonly Step[];
	/** What each harness gave the model, step by step; a harness the plugin doesn't run in has none. */
	readonly seen: Readonly<Partial<Record<Harness, readonly (readonly Seen[])[]>>>;
	/** The plugin's core/model.ftl, for the messages' lines. */
	readonly catalog: string;
	/** The section on the skills and rules it ships (shipped.ts); empty when it ships none. */
	readonly shipped?: string;
}

const NAMES: Readonly<Record<Harness, string>> = { omp: "omp", claude: "Claude Code", codex: "Codex / desktop apps" };

/** Names joined as a sentence would: "a", "a and b", "a, b and c". */
function joined(names: readonly string[]): string {
	return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The 1-based line of message `id` (or `message.attribute`) in the catalog. */
export function catalogLine(catalog: string, id: string): number | undefined {
	const [message, attribute] = id.split(".", 2);
	const lines = catalog.split("\n");
	const at = lines.findIndex(line => line.startsWith(`${message} =`));
	if (at < 0) return undefined;
	if (attribute === undefined) return at + 1;
	for (let i = at + 1; i < lines.length && !/^\S/.test(lines[i] ?? ""); i++) {
		if ((lines[i] ?? "").trimStart().startsWith(`.${attribute} =`)) return i + 1;
	}
	return undefined;
}

function sources(recording: Recording, ids: readonly string[]): string {
	if (ids.length === 0) return "";
	const file = `../../plugins/${recording.plugin}/core/model.ftl`;
	const links = ids.map(id => {
		const line = catalogLine(recording.catalog, id);
		return line === undefined ? `\`${id}\`` : `[\`${id}\`](${file}#L${line})`;
	});
	return `From ${links.join(", ")}.\n`;
}

/** A fenced block holding `text` as it is: its fence is longer than any run of backticks in it. */
export function fenced(text: string): string {
	const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map(m => m[0].length));
	const fence = "`".repeat(longest + 1);
	return `${fence}text\n${text}\n${fence}\n`;
}

function keyOf(seen: Seen): string {
	return seen.kind === "tool" ? `tool\0${seen.description}\0${JSON.stringify(seen.parameters)}` : `text\0${seen.text}`;
}

interface Group {
	readonly items: { readonly harness: Harness; readonly seen: Seen }[];
}

/** A step's texts, each once with every harness that got it. */
export function groups(recording: Recording, step: number): Group[] {
	const byKey = new Map<string, Group>();
	for (const harness of HARNESSES) {
		for (const seen of recording.seen[harness]?.[step] ?? []) {
			const key = keyOf(seen);
			const group = byKey.get(key) ?? { items: [] };
			group.items.push({ harness, seen });
			byKey.set(key, group);
		}
	}
	return [...byKey.values()];
}

function toolBlock(recording: Recording, group: Group): string {
	const [first] = group.items;
	if (first?.seen.kind !== "tool") return "";
	const where = group.items.map(({ harness, seen }) =>
		seen.kind === "tool"
			? `\`${seen.name}\` in ${NAMES[harness]}, ${seen.shown === "always" ? "in every prompt" : "behind tool search"}`
			: "",
	);
	const rows = Object.entries(first.seen.parameters).map(
		([name, text]) => `| \`${name}\` | ${text.replaceAll("|", "\\|")} |`,
	);
	const table = rows.length > 0 ? `\n| Argument | What the model reads |\n| --- | --- |\n${rows.join("\n")}\n` : "";
	return `### The tool: ${where.join("; ")}\n\n${fenced(first.seen.description)}${table}\n${sources(recording, first.seen.ids)}`;
}

/** "The tool's result in omp and Claude Code; …": each label with the harnesses it is theirs in. */
function heading(items: Group["items"]): string {
	const byLabel = new Map<string, string[]>();
	for (const { harness, seen } of items) {
		if (seen.kind === "text") byLabel.set(seen.label, [...(byLabel.get(seen.label) ?? []), NAMES[harness]]);
	}
	const text = [...byLabel].map(([label, names]) => `${label} in ${joined(names)}`).join("; ");
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function textBlock(recording: Recording, group: Group): string {
	const [first] = group.items;
	if (first?.seen.kind !== "text") return "";
	return `### ${heading(group.items)}\n\n${fenced(first.seen.text)}\n${sources(recording, first.seen.ids)}`;
}

/** A step at a glance in one harness: its tools, and each text's first line. */
function cell(seen: readonly Seen[] | undefined): string {
	if (seen === undefined) return "—";
	const parts = seen.map(s => {
		if (s.kind === "tool") return `tool \`${s.name}\``;
		const line = s.text.split("\n")[0] ?? "";
		const short = line.length > 50 ? `${line.slice(0, 50)}…` : line;
		return s.label.includes("error") ? `error: ${short}` : short;
	});
	return parts.join("; ").replaceAll("|", "\\|") || "nothing";
}

function stepTitle(step: Step, index: number): string {
	return `${index + 1}. ${step.title}`;
}

function overview(recording: Recording): string {
	const harnesses = HARNESSES.filter(h => recording.seen[h] !== undefined);
	const head = `| Step | ${harnesses.map(h => NAMES[h]).join(" | ")} |\n|${" --- |".repeat(harnesses.length + 1)}\n`;
	const rows = recording.steps.map(
		(step, i) => `| ${stepTitle(step, i)} | ${harnesses.map(h => cell(recording.seen[h]?.[i])).join(" | ")} |`,
	);
	return `${head}${rows.join("\n")}\n`;
}

function stepSection(recording: Recording, step: Step, index: number): string {
	const call =
		step.kind === "call" ? `The agent calls \`${step.tool}\` with \`${JSON.stringify(step.input)}\`.\n\n` : "";
	const blocks = groups(recording, index).map(group =>
		group.items[0]?.seen.kind === "tool" ? toolBlock(recording, group) : textBlock(recording, group),
	);
	return `## ${stepTitle(step, index)}\n\n${call}${blocks.join("\n")}`;
}

/** The page. */
export function renderPage(recording: Recording): string {
	const harnesses = joined(HARNESSES.filter(h => recording.seen[h] !== undefined).map(h => NAMES[h]));
	const intro = [
		`# What the model sees: ${recording.plugin}`,
		"",
		`What ${recording.plugin} gives the model in ${harnesses}, word for word, in a made-up`,
		`session (\`plugins/${recording.plugin}/test/scenario.ts\`) run through each harness's shell.`,
		`Every text comes from [\`core/model.ftl\`](../../plugins/${recording.plugin}/core/model.ftl); each`,
		"block names the messages it is made of. A harness frames some of it its own way: Claude Code",
		"wraps a tool error in `<tool_use_error>`, and Codex puts the call's wall time before a result.",
		"",
		"Generated by `bun tools/model-page.ts` (`just build`); `just check` fails when it is out of date.",
		"Don't edit it: change the catalog or the scenario.",
		"",
	].join("\n");
	const sections = recording.steps.map((step, i) => stepSection(recording, step, i));
	const shipped = recording.shipped ? `\n${recording.shipped}\n` : "";
	return `${intro}\n${overview(recording)}\n${sections.join("\n")}${shipped}`;
}
