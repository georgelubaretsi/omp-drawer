// What applies for each of a plugin's settings, from four levels, lowest first: the plugin's
// default, the project's file (<project>/.agents/piebird/settings.json), the person's file
// (~/.agents/piebird/settings.json), and the person's choice in one agent's own settings screen.
// A repo can't override the person. Each file holds a section per plugin, keyed by its name; a
// value the declarations don't allow is reported and skipped, never applied. The shells read the
// files and pass in what they hold; a path stays as written, for the shell to resolve against
// the file it came from.
import type { Declaration, Declared } from "./declared";
import type { Io, Place } from "./io";

export type Level = "default" | "project" | "user" | "agent";

export interface Resolved {
	readonly value: string;
	readonly from: Level;
}

export type Issue = "not-json" | "not-an-object" | "unknown" | "secret" | "not-a-string" | "not-a-choice";

/** A value a level holds that doesn't apply. `key` is empty when the plugin's whole section is wrong. */
export interface Problem {
	readonly level: Exclude<Level, "default">;
	readonly key: string;
	readonly issue: Issue;
}

/** An agent's own choice that follows the person's shared one. */
export const SHARED = "shared";

/** Choices by key, as an agent's own settings hold them. */
export type Choices = Readonly<Record<string, string | undefined>>;

export interface Sources {
	/** The project's file, parsed; undefined when there is none. */
	readonly project?: unknown;
	/**
	 * The agent's own choices kept in the project (omp's .omp/plugin-overrides.json): a repo can
	 * hold them, so they rank with the project's file, over it, and below the person.
	 */
	readonly agentProject?: Choices;
	/** The person's file, parsed; undefined when there is none. */
	readonly user?: unknown;
	/** The person's choices in the agent's own screen, by key; SHARED, empty or undefined follows the files. */
	readonly agent?: Choices;
}

/** `own`, an agent's choice for setting `d`, when it is one; else undefined, its problem in `problems`. */
function agentValue(
	d: Declaration,
	own: string | undefined,
	at: { key: string; level: Problem["level"]; problems: Problem[] },
) {
	if (own === undefined || own === SHARED || own === "") return undefined;
	const issue = issueWith(d, own);
	if (issue === undefined) return own;
	at.problems.push({ level: at.level, key: at.key, issue });
	return undefined;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issueWith(d: Declaration, value: unknown): Issue | undefined {
	if (typeof value !== "string") return "not-a-string";
	if (d.type === "choice" && !d.choices.some(c => c.value === value)) return "not-a-choice";
	return undefined;
}

interface Section {
	readonly values: ReadonlyMap<string, string>;
	readonly problems: readonly Problem[];
}

/** The plugin's section of one file: the values that apply, and what doesn't. */
function section(plugin: string, declared: Declared, level: "project" | "user", file: unknown): Section {
	const values = new Map<string, string>();
	const problems: Problem[] = [];
	const own = record(file) ? file[plugin] : file;
	if (own === undefined) return { values, problems };
	if (!record(own)) return { values, problems: [{ level, key: "", issue: "not-an-object" }] };
	for (const [key, value] of Object.entries(own)) {
		const d = declared.settings[key];
		const issue = Object.hasOwn(declared.secrets, key) ? "secret" : d === undefined ? "unknown" : issueWith(d, value);
		if (issue === undefined && typeof value === "string") values.set(key, value);
		else problems.push({ level, key, issue: issue ?? "not-a-string" });
	}
	return { values, problems };
}

/** Each declared setting's value and the level it came from, with what was skipped. */
export function resolveSettings(
	plugin: string,
	declared: Declared,
	sources: Sources,
): { values: Readonly<Record<string, Resolved>>; problems: readonly Problem[] } {
	const project = section(plugin, declared, "project", sources.project);
	const user = section(plugin, declared, "user", sources.user);
	const problems: Problem[] = [...project.problems, ...user.problems];
	const values: Record<string, Resolved> = {};
	for (const [key, d] of Object.entries(declared.settings)) {
		let resolved: Resolved = { value: d.default, from: "default" };
		const fromProject = project.values.get(key);
		if (fromProject !== undefined) resolved = { value: fromProject, from: "project" };
		const fromAgentProject = agentValue(d, sources.agentProject?.[key], { key, level: "project", problems });
		if (fromAgentProject !== undefined) resolved = { value: fromAgentProject, from: "project" };
		const fromUser = user.values.get(key);
		if (fromUser !== undefined) resolved = { value: fromUser, from: "user" };
		const own = agentValue(d, sources.agent?.[key], { key, level: "agent", problems });
		if (own !== undefined) resolved = { value: own, from: "agent" };
		values[key] = resolved;
	}
	return { values, problems };
}

/** Where the settings files are, under the home folder and under the project. */
export const SETTINGS_PATH = ".agents/piebird/settings.json";

async function readFile(io: Io, path: string, level: "project" | "user", problems: Problem[]): Promise<unknown> {
	const text = await io.readText(path);
	if (text === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(text);
		return parsed;
	} catch {
		problems.push({ level, key: "", issue: "not-json" });
		return undefined;
	}
}

/** A plugin's declarations, and its agent's own choices when the agent has a screen for them. */
export interface PluginSettings {
	readonly plugin: string;
	readonly declared: Declared;
	readonly agent?: Choices;
	readonly agentProject?: Choices;
}

/** One setting's choices in an agent's own settings: the person's, and one the agent keeps in the project. */
export interface AgentChoice {
	readonly person?: unknown;
	readonly project?: unknown;
}

/** `choice` for the setting `key`, as readSettings takes an agent's choices. */
export function agentChoices(key: string, choice: AgentChoice = {}): Pick<PluginSettings, "agent" | "agentProject"> {
	const one = (value: unknown): Choices => (typeof value === "string" ? { [key]: value } : {});
	return { agent: one(choice.person), agentProject: one(choice.project) };
}

/**
 * The plugin's settings from the files at `place` and the agent's own screen. Working in the home
 * folder, the two files are one: the person's.
 */
export async function readSettings(
	io: Io,
	place: Place,
	{ plugin, declared, agent, agentProject }: PluginSettings,
): Promise<{ values: Readonly<Record<string, Resolved>>; problems: readonly Problem[] }> {
	const problems: Problem[] = [];
	const userPath = `${place.home}/${SETTINGS_PATH}`;
	const projectPath = `${place.project}/${SETTINGS_PATH}`;
	const user = await readFile(io, userPath, "user", problems);
	const project = projectPath === userPath ? undefined : await readFile(io, projectPath, "project", problems);
	const resolved = resolveSettings(plugin, declared, { project, agentProject, user, agent });
	return { values: resolved.values, problems: [...problems, ...resolved.problems] };
}
