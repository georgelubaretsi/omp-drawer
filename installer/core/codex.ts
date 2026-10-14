// What the installer writes for Codex and ChatGPT desktop (which is the Codex app; both read
// ~/.codex): the personal marketplace, ~/.agents/plugins/marketplace.json, whose paths are relative
// to the home folder; and `[plugins."<plugin>@<marketplace>"] enabled = true` in
// ~/.codex/config.toml. Codex rewrites both files itself, so they are edited, never replaced: other
// entries, tables and comments stay as they were.

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const HEADER = /^\s*\[/;

/** The end of the table whose header is at `start`: the next header, or the end. */
function tableEnd(lines: readonly string[], start: number): number {
	let end = start + 1;
	while (end < lines.length && !HEADER.test(lines[end] ?? "")) end++;
	return end;
}

function header(id: string): string {
	return `[plugins.${JSON.stringify(id)}]`;
}

/** Whether `line` heads the plugin's table or one of its sub-tables, wherever TOML put it. */
function headsPlugin(line: string, id: string): boolean {
	const t = line.trim();
	return t === header(id) || t.startsWith(`[plugins.${JSON.stringify(id)}.`);
}

/** Checks the edited file still reads as TOML with the plugins as they should be. */
function checked(text: string, ids: readonly string[], enabled: boolean | undefined): string {
	const parsed: unknown = Bun.TOML.parse(text);
	const plugins = isFields(parsed) && isFields(parsed.plugins) ? parsed.plugins : {};
	for (const id of ids) {
		const table = plugins[id];
		const state = isFields(table) ? table.enabled : undefined;
		if (state !== enabled) throw new Error(`config.toml: ${id} came out ${String(state)}`);
	}
	return text;
}

/** config.toml with each plugin's table saying `enabled = true`. */
export function enablePlugins(toml: string, ids: readonly string[]): string {
	const lines = toml === "" ? [] : toml.replace(/\n$/, "").split("\n");
	for (const id of ids) {
		const start = lines.findIndex(l => l.trim() === header(id));
		if (start === -1) {
			lines.push(...(lines.length > 0 ? [""] : []), header(id), "enabled = true");
			continue;
		}
		// The table's own keys only: a sub-table's `enabled` is another server's switch.
		const at = lines.slice(start + 1, tableEnd(lines, start)).findIndex(l => /^\s*enabled\s*=/.test(l));
		if (at === -1) lines.splice(start + 1, 0, "enabled = true");
		else lines[start + 1 + at] = "enabled = true";
	}
	return checked(`${lines.join("\n")}\n`, ids, true);
}

/** config.toml without the plugins' tables and sub-tables. */
export function removePlugins(toml: string, ids: readonly string[]): string {
	let lines = toml.replace(/\n$/, "").split("\n");
	for (const id of ids) {
		for (
			let start = lines.findIndex(l => headsPlugin(l, id));
			start !== -1;
			start = lines.findIndex(l => headsPlugin(l, id))
		)
			lines = [...lines.slice(0, start), ...lines.slice(tableEnd(lines, start))];
	}
	const text = lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/^\n+/, "");
	return checked(text === "" ? "" : `${text.replace(/\n+$/, "")}\n`, ids, undefined);
}

export interface CodexEntry {
	readonly name: string;
	readonly category: string;
}

/** The personal marketplace's name: the person's own when they have one, else `fallback`. */
export function marketplaceName(existing: unknown, fallback: string): string {
	return isFields(existing) && typeof existing.name === "string" && existing.name !== "" ? existing.name : fallback;
}

/**
 * The personal marketplace with `entries` listed at `./.codex/plugins/<name>` (paths are relative
 * to the home folder), replacing earlier entries of the same name and keeping everyone else's.
 */
export function withEntries(existing: unknown, fallback: string, entries: readonly CodexEntry[]): Fields {
	const base: Fields = isFields(existing) ? { ...existing } : {};
	const names = new Set(entries.map(e => e.name));
	const listed: unknown[] = Array.isArray(base.plugins) ? base.plugins : [];
	const kept = listed.filter(p => !(isFields(p) && names.has(String(p.name))));
	const added = entries.map(e => ({
		name: e.name,
		source: { source: "local", path: `./.codex/plugins/${e.name}` },
		policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
		category: e.category,
	}));
	return { ...base, name: marketplaceName(existing, fallback), plugins: [...kept, ...added] };
}

/** The personal marketplace without the named plugins. */
export function withoutEntries(existing: unknown, names: readonly string[]): Fields | undefined {
	if (!isFields(existing)) return undefined;
	const plugins: unknown[] = Array.isArray(existing.plugins) ? existing.plugins : [];
	return { ...existing, plugins: plugins.filter(p => !(isFields(p) && names.includes(String(p.name)))) };
}
