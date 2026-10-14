// Plugin settings and secrets: everything a person sets for a plugin,
// declared in its core/settings.json. Not at the plugin root: Claude Code reads a settings.json
// there as its own defaults (code.claude.com/docs/en/plugins/components, "Default settings").
// The build checks the file against tools/settings.schema.json plus what a schema can't say (the
// default among the choices, no repeated choice, no key both a setting and a secret), copies it
// beside the plugin's vault for it to embed, and writes each agent's own settings
// declaration from its settings: a choice there wins in that agent, and its first value,
// `shared`, the default, follows the settings files. Secrets stay with the vault, in the system's
// secret store: no agent's settings screen holds them.
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { generatedFrom, sourceConst } from "./gen-ts";
import { isObject, type JsonObject, toJson } from "./json";
import { programDir } from "./native";
import { readJson } from "./parse";
import { kindProblem, type PluginDir } from "./paths";
import { schemaProblems, type SettingDeclaration, type SettingsFile, validateSettings } from "./schemas";

/** One setting: its key and its declaration. */
export type Setting = SettingDeclaration & { key: string };

/** Where a plugin declares its settings and secrets. */
export const SETTINGS_FILE = "core/settings.json";
/** Its declarations as code, for the shells. */
export const SETTINGS_GEN = "core/settings.gen.ts";
/** Its copy beside the plugin's Go program, in reach of go:embed. */
export const PROGRAM_SETTINGS = "settings.gen.json";
/** An agent's own setting that follows the shared one. */
export const SHARED = "shared";

/** What the schema can't check in `file`, the settings.json at `rel`. */
function declarationProblems(rel: string, file: SettingsFile): string[] {
	const out: string[] = [];
	for (const [key, s] of Object.entries(file.settings ?? {})) {
		if (s.type !== "choice") continue;
		const values = s.choices.map(c => c.value);
		if (!values.includes(s.default))
			out.push(`${rel}: /settings/${key}/default "${s.default}" isn't one of the choices`);
		if (new Set(values).size !== values.length) out.push(`${rel}: /settings/${key}/choices repeats a value`);
	}
	for (const key of Object.keys(file.secrets ?? {}))
		if (Object.hasOwn(file.settings ?? {}, key)) out.push(`${rel}: "${key}" is both a setting and a secret`);
	return out;
}

/** The settings the plugin in `dir` declares (none without core/settings.json), sorted by key. */
export async function loadSettings(root: string, dir: PluginDir, problems: string[]): Promise<Setting[]> {
	const rel = `${dir.base}/${SETTINGS_FILE}`;
	if (!(await lstat(join(dir.path, SETTINGS_FILE)).catch(() => undefined))) return [];
	const kind = await kindProblem(dir, SETTINGS_FILE, "file");
	if (kind) {
		problems.push(kind);
		return [];
	}
	const parsed = await readJson(root, rel, problems);
	if (parsed === undefined) return [];
	if (!validateSettings(parsed)) {
		problems.push(...schemaProblems(rel, validateSettings.errors));
		return [];
	}
	const out = declarationProblems(rel, parsed);
	problems.push(...out);
	if (out.length > 0) return [];
	// Sorted as Go sorts strings, by bytes, so the program and the agents' screens agree (keys are unique).
	const sorted = Object.entries(parsed.settings ?? {}).toSorted(([a], [b]) => (a < b ? -1 : 1));
	return sorted.map(([key, s]) => ({ key, ...s }));
}

/** The plugin's declarations as code: a Claude Code mod can import only code. */
function settingsGen(declared: JsonObject): string {
	return [
		generatedFrom("settings.json"),
		'import { parseDeclared } from "../kit/core/declared";',
		"",
		sourceConst(JSON.stringify(declared)),
		"",
		"export const declared = parseDeclared(SOURCE);",
		"",
	].join("\n");
}

/**
 * Each plugin's core/settings.gen.ts and its Go program's copy (without `$schema`, a path from
 * core/) into `files`, and every place one may be into `owned`. loadSources has validated the
 * source.
 */
export async function settingsFiles(
	root: string,
	plugins: readonly { name: string; program?: string }[],
	files: Map<string, string>,
	owned: string[],
): Promise<void> {
	for (const { name, program } of plugins) {
		const gen = `plugins/${name}/${SETTINGS_GEN}`;
		const copy = program === undefined ? undefined : `${programDir(program)}/${PROGRAM_SETTINGS}`;
		owned.push(gen, ...(copy === undefined ? [] : [copy]));
		const source = `plugins/${name}/${SETTINGS_FILE}`;
		if (!existsSync(join(root, source))) continue;
		const parsed = await readJson(root, source, []);
		if (!isObject(parsed)) continue;
		const { $schema: _schema, ...declared } = parsed;
		files.set(gen, settingsGen(declared));
		if (copy !== undefined) files.set(copy, toJson(declared));
	}
}

/** Where a setting's shared value comes from, as an agent's settings screen says it. */
const FOLLOWS =
	"as your piebird settings files say (~/.agents/piebird/settings.json, and a project's .agents/piebird/settings.json), which every agent reads.";

/** What an agent's settings screen says about a setting, with where the shared choice is made. */
function about(s: Setting): string {
	if (s.type !== "choice") return `${s.about} Empty (the default here): ${FOLLOWS}`;
	const choices = s.choices.map(c => ` "${c.value}": ${c.label}. ${c.means}`).join("");
	return `${s.about} "${SHARED}" (the default here): ${FOLLOWS}${choices}`;
}

/**
 * Claude Code's userConfig for the settings (code.claude.com/docs/en/plugins/manifest-reference,
 * "User configuration"): a choice's options start with `shared`, its default; a text or path is
 * empty by default, which follows the shared one too.
 */
export function claudeUserConfig(settings: Setting[]): JsonObject {
	const out: JsonObject = {};
	for (const s of settings) {
		const field = { type: "string", title: s.title, description: about(s) };
		out[s.key] =
			s.type === "choice"
				? { ...field, options: [SHARED, ...s.choices.map(c => c.value)], default: SHARED }
				: { ...field, default: "" };
	}
	return out;
}

/** omp's package.json `omp.settings` for the settings (EnumSetting and StringSetting, extensibility/plugins/types.ts). */
export function ompSettings(settings: Setting[]): JsonObject {
	const out: JsonObject = {};
	for (const s of settings) {
		out[s.key] =
			s.type === "choice"
				? { type: "enum", description: about(s), values: [SHARED, ...s.choices.map(c => c.value)], default: SHARED }
				: { type: "string", description: about(s), default: "" };
	}
	return out;
}

/** The JSON Schema for the settings files, in this repo, for editors: every plugin's section. */
export const SETTINGS_FILE_SCHEMA = "schemas/settings.schema.json";

function valueSchema(s: Setting): JsonObject {
	const described = { title: s.title, description: s.about, default: s.default };
	if (s.type !== "choice") return { ...described, type: "string" };
	return { ...described, oneOf: s.choices.map(c => ({ const: c.value, title: c.label, description: c.means })) };
}

/**
 * ~/.agents/piebird/settings.json and <project>/.agents/piebird/settings.json: a section per
 * plugin with settings, keyed by its name, holding only declared settings (kit/core/settings.ts).
 */
export function settingsFileSchema(plugins: readonly { name: string; settings: Setting[] }[]): JsonObject {
	const sections: JsonObject = {};
	for (const p of plugins) {
		if (p.settings.length === 0) continue;
		sections[p.name] = {
			type: "object",
			additionalProperties: false,
			properties: Object.fromEntries(p.settings.map(s => [s.key, valueSchema(s)])),
		};
	}
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		title: "piebird settings: ~/.agents/piebird/settings.json, <project>/.agents/piebird/settings.json",
		description:
			"Settings for the piebird plugins, a section per plugin. The project's file applies to everyone in the repo; yours, in your home folder, wins over it; an agent's own settings screen wins over both. Never secrets.",
		type: "object",
		additionalProperties: false,
		properties: { $schema: { type: "string" }, ...sections },
	};
}
