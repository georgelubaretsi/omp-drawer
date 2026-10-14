// The read operation without a session: the latest sessions, newest first, each with when it
// started, its title and its first prompt, to pick the one to read. A shell that knows the
// project lists its folder of sessions (omp's, Claude Code's); the program, which Codex and the
// desktop apps start without telling it the project, lists every agent's, each with its project.
import type { Io, IoEntry } from "../kit/core/io";
import { joinText, type ModelText } from "../kit/core/model";
import { headLines, type Opener } from "./formats/journal";
import { contentText, messageOf } from "./journal";
import { asObject, asString, type JsonObject, parseLine } from "./json";
import { HEAD, openerOf, type Roots, sessionIdOf } from "./lookup";
import { model } from "./model.gen";
import { joinItems, shownPath } from "./text";

/** Sessions listed at most; older ones are counted. */
export const LIST_LIMIT = 20;
/** Characters of a first prompt shown. */
const PROMPT_LENGTH = 100;

/** Where the sessions to list are: this project's folder of them, or every agent's. */
export type ListSource = { kind: "folder"; folder: string; current?: string } | { kind: "all"; roots: Roots };

type Agent = keyof Roots;
const AGENTS: readonly Agent[] = ["omp", "claude", "codex"];

interface Journal {
	file: string;
	id: string;
	/** From omp's file name, when it has one. */
	started?: string;
	modified: number;
	agent?: Agent;
}

function journalOf(dir: string, entry: IoEntry): Journal | undefined {
	const id = entry.directory ? undefined : sessionIdOf(entry.name);
	if (id === undefined) return undefined;
	const time = /^(\d{4}-\d\d-\d\dT\d\d)-(\d\d)-(\d\d)-(\d+)Z_/.exec(entry.name);
	const started = time ? `${time[1]}:${time[2]}:${time[3]}.${time[4]}Z` : undefined;
	return { file: `${dir}/${entry.name}`, id, ...(started ? { started } : {}), modified: entry.modified };
}

/** How deep each agent keeps its journals: omp's and Claude Code's per project, Codex's per day. */
const DEPTH: Readonly<Record<Agent, number>> = { omp: 1, claude: 1, codex: 3 };

/** The journals `depth` folders under `root`; deeper files (a session's own subagents) aren't sessions. */
async function journalsUnder(io: Io, root: string, depth: number, agent: Agent): Promise<Journal[]> {
	const out: Journal[] = [];
	let level = [root];
	for (let d = 0; d <= depth && level.length > 0; d++) {
		const next: string[] = [];
		for (const dir of level) {
			for (const entry of (await io.list(dir)) ?? []) {
				if (entry.directory) next.push(`${dir}/${entry.name}`);
				const journal = d === depth ? journalOf(dir, entry) : undefined;
				if (journal !== undefined) out.push({ ...journal, agent });
			}
		}
		level = next;
	}
	return out;
}

/** omp's journals by their name's time, others by when they were last written; newest first. */
function newestFirst(journals: Journal[]): Journal[] {
	return journals.toSorted((a, b) => (b.started ?? "").localeCompare(a.started ?? "") || b.modified - a.modified);
}

interface Head {
	title?: string;
	prompt?: string;
	started?: string;
	project?: string;
}

/** The folder a session ran in, from a record: omp's header, Claude Code's lines, Codex's meta. */
function projectOf(record: JsonObject | undefined): string | undefined {
	const payload = record?.type === "session_meta" ? asObject(record.payload) : undefined;
	return asString(payload?.cwd) ?? asString(record?.cwd);
}

function noteEntry(found: Head, entry: JsonObject): void {
	const title = entry.type === "title" || entry.type === "session" ? asString(entry.title) : undefined;
	if (title && found.title === undefined) found.title = title;
	const message = messageOf(entry);
	if (message?.role !== "user" || found.prompt !== undefined) return;
	const words = contentText(message.content).replace(/\s+/g, " ").trim();
	found.prompt = words.length > PROMPT_LENGTH ? `${words.slice(0, PROMPT_LENGTH)}…` : words;
	found.started = asString(entry.timestamp);
}

/** The session's title, first prompt and project, when the journal's start holds them. */
async function head(open: Opener): Promise<Head> {
	const found: Head = {};
	for await (const { raw, entries } of headLines(open, HEAD)) {
		found.project ??= projectOf(parseLine(raw));
		for (const entry of entries) noteEntry(found, entry);
		if (found.title !== undefined && found.prompt !== undefined && found.project !== undefined) break;
	}
	return found;
}

async function item(io: Io, journal: Journal, at: { current?: string; home: string }): Promise<ModelText> {
	const { title, prompt, started, project } = await head(openerOf(io, journal.file));
	const parts = [
		model.text("list-item", { id: journal.id, started: journal.started ?? started ?? "" }),
		...(journal.file === at.current ? [model.text("list-this")] : []),
		...(journal.agent ? [model.text("list-agent", { agent: journal.agent })] : []),
		...(journal.agent && project ? [model.text("list-project", { project: shownPath(project, at.home) })] : []),
		...(title ? [model.text("list-title", { title })] : []),
		...(prompt ? [model.text("list-prompt", { prompt })] : []),
	];
	return joinItems(parts, "join-dot") ?? parts[0];
}

/** The sessions to list, newest first. */
async function journalsOf(io: Io, source: ListSource): Promise<Journal[]> {
	if (source.kind === "folder")
		return newestFirst(((await io.list(source.folder)) ?? []).flatMap(e => journalOf(source.folder, e) ?? []));
	const all: Journal[] = [];
	for (const agent of AGENTS) all.push(...(await journalsUnder(io, source.roots[agent], DEPTH[agent], agent)));
	// Each agent names its journals its own way: when each was last written orders them all.
	return all.toSorted((a, b) => b.modified - a.modified);
}

function header(source: ListSource, home: string, shown: number, total: number): ModelText {
	if (source.kind === "all")
		return total > shown ? model.text("list-header-all-older", { shown, total }) : model.text("list-header-all");
	const folder = shownPath(source.folder, home);
	return total > shown
		? model.text("list-header-older", { folder, shown, total })
		: model.text("list-header", { folder });
}

function empty(source: ListSource, home: string): ModelText {
	const folders = source.kind === "folder" ? [source.folder] : AGENTS.map(agent => source.roots[agent]);
	return model.text("list-empty", {
		folder:
			joinItems(
				folders.map(f => shownPath(f, home)),
				"join-or",
			)?.text ?? "",
	});
}

/** The sessions as the operation shows them. */
export async function listSessions(io: Io, source: ListSource, home: string): Promise<ModelText> {
	const journals = await journalsOf(io, source);
	if (journals.length === 0) return empty(source, home);
	const current = source.kind === "folder" ? source.current : undefined;
	const listed = journals.slice(0, LIST_LIMIT);
	const items: ModelText[] = [];
	for (const j of listed) items.push(await item(io, j, { ...(current === undefined ? {} : { current }), home }));
	const other = listed.find(j => j.file !== current);
	const read =
		other &&
		model.text("list-read", {
			call: model.text("next-call", { arguments: JSON.stringify({ session: other.id, user: true, after: 20 }) })
				.text,
		});
	return joinText([header(source, home, listed.length, journals.length), ...items, ...(read ? [read] : [])]);
}
