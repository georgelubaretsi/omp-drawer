// The plugins an installer carries, read from its payload: the catalog (which agents each is for,
// its vault) and each plugin's plugin.json (its version and description) and declared settings.
import { type Declared, parseDeclared } from "../../kit/core/declared";
import type { PayloadFile } from "../core/payload";

export interface Plugin {
	readonly name: string;
	readonly version: string;
	readonly description: string;
	readonly category: string;
	/** The agents its catalog entry lists: omp, claude, codex, tern. */
	readonly hosts: readonly string[];
	/** Whether it has a program (native/<name>), which Codex and Claude chat run as its MCP server. */
	readonly program: boolean;
	/** Its vault (catalog `program`), which signs the person in: `native/<vault> sign-in`. */
	readonly vault?: string;
	/** Its settings, when it has any (core/settings.json). */
	readonly declared?: Declared;
}

export const MARKET = "piebird";

function fileText(files: readonly PayloadFile[], path: string): string | undefined {
	const file = files.find(f => f.path === path);
	return file ? new TextDecoder().decode(file.data) : undefined;
}

function json(files: readonly PayloadFile[], path: string): Record<string, unknown> {
	const source = fileText(files, path);
	if (source === undefined) throw new Error(`the payload has no ${path}`);
	const value: unknown = JSON.parse(source);
	if (typeof value !== "object" || value === null) throw new Error(`${path} isn't an object`);
	return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function plugin(files: readonly PayloadFile[], entry: unknown): Plugin {
	const e = typeof entry === "object" && entry !== null ? Object.fromEntries(Object.entries(entry)) : {};
	const name = text(e.name);
	const manifest = json(files, `plugins/${name}/plugin.json`);
	const hosts: unknown[] = Array.isArray(e.hosts) ? e.hosts : [];
	const settings = fileText(files, `plugins/${name}/core/settings.json`);
	return {
		name,
		version: text(manifest.version),
		description: text(manifest.description),
		category: text(e.category),
		hosts: hosts.map(text),
		program: files.some(f => f.path === `plugins/${name}/native/${name}`),
		...(typeof e.program === "string" ? { vault: e.program } : {}),
		...(settings === undefined ? {} : { declared: parseDeclared(settings) }),
	};
}

export function pluginsOf(files: readonly PayloadFile[]): Plugin[] {
	const entries = json(files, "catalog.json").plugins;
	return (Array.isArray(entries) ? entries : []).map((entry: unknown) => plugin(files, entry));
}

/** The files of one plugin in the payload, relative to the plugin's folder. */
export function pluginFiles(files: readonly PayloadFile[], name: string): PayloadFile[] {
	const prefix = `plugins/${name}/`;
	return files.filter(f => f.path.startsWith(prefix)).map(f => ({ ...f, path: f.path.slice(prefix.length) }));
}

/** The name people see: "piebird-kagi-search" is "Kagi search". */
export function title(name: string): string {
	const words = name.replace(/^piebird-/, "").replaceAll("-", " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}
