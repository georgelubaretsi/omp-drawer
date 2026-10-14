// What every step works with, and what it reports to the page.
import { join } from "node:path";
import type { PayloadFile } from "../core/payload";
import type { Agents, AppName, Sys } from "../system";
import { type Plugin, title } from "./plugins";

export interface Ctx {
	readonly sys: Sys;
	readonly agents: Agents;
	readonly payload: readonly PayloadFile[];
	readonly plugins: readonly Plugin[];
	readonly dirs: Dirs;
}

/** A file the person opens from the page with an app, whose own window adds it. */
export interface Opening {
	readonly label: string;
	readonly app: AppName;
	readonly file: string;
}

/** One agent's result, in the person's words; empty `text` when the agent isn't here. */
export interface Step {
	readonly agent: string;
	readonly ok: boolean;
	readonly text: string;
	/** An app that loads the change only after a restart. */
	readonly restart?: AppName;
	readonly opens?: readonly Opening[];
}

export interface Dirs {
	/** The shared copy: omp and Claude Code install from it. */
	readonly market: string;
	readonly mcpb: string;
	/** Where Codex's personal marketplace lists plugins from: it must be inside the home folder. */
	readonly codexSources: string;
	readonly codexHome: string;
	readonly personalMarket: string;
	readonly claudeHome: string;
}

/** The folders, honouring CODEX_HOME and CLAUDE_CONFIG_DIR as Codex and Claude Code do. */
export function dirsFor(sys: Sys): Dirs {
	return {
		market: join(sys.home, ".agents", "piebird", "marketplace"),
		mcpb: join(sys.home, ".agents", "piebird", "mcpb"),
		codexSources: join(sys.home, ".codex", "plugins"),
		codexHome: sys.env.CODEX_HOME || join(sys.home, ".codex"),
		personalMarket: join(sys.home, ".agents", "plugins", "marketplace.json"),
		claudeHome: sys.env.CLAUDE_CONFIG_DIR || join(sys.home, ".claude"),
	};
}

export function skipped(agent: string): Step {
	return { agent, ok: true, text: "" };
}

/** The first line of what a failed command said, for the page. */
export function firstLine(text: string): string {
	return text.trim().split("\n")[0]?.slice(0, 300) ?? "";
}

/** Plugins (names or `<name>@<marketplace>` ids) as people read them: "Kagi search and Threads". */
export function listed(names: readonly string[]): string {
	const titles = names.map(n => title(n.replace(/@.*$/, "")));
	return titles.length <= 1 ? (titles[0] ?? "") : `${titles.slice(0, -1).join(", ")} and ${titles.at(-1)}`;
}

/** A command's JSON output; undefined when it printed something else. */
export function parsed(text: string): unknown {
	try {
		const value: unknown = JSON.parse(text);
		return value;
	} catch {
		return undefined;
	}
}

export function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: {};
}

export function listOf(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : [];
}
