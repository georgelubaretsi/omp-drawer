// Host parts: code a plugin runs inside one host, hooked into the host's own events. Each lives in
// the Agent Plugins extension directory (§8.2) named for the host's reverse-domain namespace,
// with its hooks file at hooks/hooks.json there, and the build names that file in a manifest only
// that host reads. Not at the plugin root: Claude Code and Codex both read a root hooks/hooks.json,
// so each would run the other's hooks, and Codex refuses a Claude Code mod's `modules` key.
// - Claude Code (com.anthropic.claudecode/): a mod (code.claude.com/docs/en/plugins/mods); the
//   generated .claude-plugin/plugin.json names the file in `hooks`.
// - Codex (com.openai/): hooks (developers.openai.com/codex/hooks); the generated
//   .codex-plugin/plugin.json names it in `hooks`. Codex reads that file beside an Agent Plugins
//   plugin.json without extensions.com.openai (which this build doesn't allow).
// The checks: the folder exists only when the catalog lists its host, and it holds the hooks file.
// The hosts check the rest: consumers.test.ts loads the parts with `claude plugin validate` and
// Codex's app server.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { hasExactly, kindProblem, type PluginDir } from "./paths";
import type { CatalogEntry, Host } from "./schemas";

/** A host whose plugins may carry a part: its folder and the generated manifest naming the hooks file. */
export interface HostPart {
	host: Host;
	dir: string;
	manifest: string;
}

export const HOST_PARTS: readonly HostPart[] = [
	{ host: "claude", dir: "com.anthropic.claudecode", manifest: ".claude-plugin/plugin.json" },
	{ host: "codex", dir: "com.openai", manifest: ".codex-plugin/plugin.json" },
];

/** The part's hooks file as its manifest's `hooks` names it, from the plugin's folder. */
export function hooksFile(part: HostPart): string {
	return `./${part.dir}/hooks/hooks.json`;
}

/** Problems with `part` in plugins/<entry.name>, whose folder lists `names`. */
async function partProblems(root: string, entry: CatalogEntry, part: HostPart, names: string[]): Promise<string[]> {
	const out: string[] = [];
	const base = `plugins/${entry.name}`;
	if (!hasExactly(names, part.dir, base, out)) return out;
	if (!entry.hosts.includes(part.host)) {
		out.push(
			`${base}/${part.dir}/: only a plugin with the ${part.host} host has one; add "${part.host}" to its hosts in catalog.json`,
		);
		return out;
	}
	const steps = [
		[part.dir, "directory"],
		["hooks", "directory"],
		["hooks.json", "file"],
	] as const;
	let at: PluginDir = { base, path: join(root, base) };
	for (const [name, kind] of steps) {
		if (name !== part.dir && !hasExactly(await readdir(at.path), name, at.base, out)) {
			out.push(`${base}${hooksFile(part).slice(1)}: missing; the ${part.host} host loads the part from it`);
			return out;
		}
		const problem = await kindProblem(at, name, kind);
		if (problem) return [...out, problem];
		at = { base: `${at.base}/${name}`, path: join(at.path, name) };
	}
	return out;
}

/**
 * The host part rules for every catalog entry whose plugin loaded (`loaded`, by name), and that
 * each host the entry lists under `development` has a part to hold back.
 */
export async function hostPartProblems(
	root: string,
	entries: CatalogEntry[],
	loaded: ReadonlySet<string>,
): Promise<string[]> {
	const out: string[] = [];
	for (const [i, entry] of entries.entries()) {
		if (!loaded.has(entry.name)) continue;
		const names = await readdir(join(root, "plugins", entry.name));
		for (const part of HOST_PARTS) out.push(...(await partProblems(root, entry, part, names)));
		for (const host of entry.development ?? []) {
			const part = HOST_PARTS.find(p => p.host === host);
			if (!part || !names.includes(part.dir))
				out.push(
					`catalog.json: /plugins/${i}/development lists ${host}, but plugins/${entry.name} has no ${host} part`,
				);
		}
	}
	return out;
}
