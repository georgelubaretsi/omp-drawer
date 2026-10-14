// core/model.ftl → core/model.gen.ts: the catalog embedded as text (a Claude Code mod can import
// only code) and typed by message, so a wrong id or variable fails to compile.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FluentResource } from "@fluent/bundle";
import type { Expression, Message, Pattern, Term } from "@fluent/bundle/esm/ast.js";
import { generatedFrom, key, sourceConst } from "./gen-ts";
import { ValidationError } from "./json";

export const MODEL = "core/model.ftl";
export const MODEL_GEN = "core/model.gen.ts";

// The runtime parser's own pattern for where an entry starts; it skips an entry it can't parse.
const ENTRY_START = /^(-?[a-zA-Z][\w-]*) *= */gm;
// What starts at a line's start, other than a comment, the brace that closes a multiline
// placeable, a variant or an attribute (which Fluent takes unindented too): an entry, or text the
// runtime parser would skip without a word.
const LINE_START = /^[^\s#}[*.].*$/gm;

type Entry = Message | Term;

function expressionVariables(e: Expression, out: Set<string>, refs: Set<string>): void {
	switch (e.type) {
		case "var":
			out.add(e.name);
			return;
		case "select":
			expressionVariables(e.selector, out, refs);
			for (const v of e.variants) patternVariables(v.value, out, refs);
			return;
		case "mesg":
			refs.add(e.attr ? `${e.name}.${e.attr}` : e.name);
			return;
		case "func":
			for (const arg of e.args) if (arg.type !== "narg") expressionVariables(arg, out, refs);
			return;
		// A term gets only its named arguments, which are literals; it ignores positional ones.
		case "term":
		case "str":
		case "num":
			return;
	}
}

function patternVariables(p: Pattern, out: Set<string>, refs: Set<string>): void {
	if (typeof p === "string") return;
	for (const el of p) if (typeof el !== "string") expressionVariables(el, out, refs);
}

/** Each message id (and `id.attribute`) with the variables it needs, references followed. */
export function messageVariables(entries: readonly Entry[], file: string): Map<string, string[]> {
	const patterns = new Map<string, Pattern>();
	for (const entry of entries) {
		if (entry.id.startsWith("-")) continue;
		if (entry.value !== null) patterns.set(entry.id, entry.value);
		for (const [attr, value] of Object.entries(entry.attributes)) patterns.set(`${entry.id}.${attr}`, value);
	}
	const resolved = new Map<string, Set<string>>();
	const resolve = (id: string, seen: Set<string>): Set<string> => {
		const done = resolved.get(id);
		if (done) return done;
		const pattern = patterns.get(id);
		if (pattern === undefined) throw new ValidationError([`${file}: a reference to ${id}, which isn't there`]);
		if (seen.has(id)) throw new ValidationError([`${file}: ${id} refers to itself`]);
		const vars = new Set<string>();
		const refs = new Set<string>();
		patternVariables(pattern, vars, refs);
		for (const ref of refs) for (const v of resolve(ref, new Set([...seen, id]))) vars.add(v);
		resolved.set(id, vars);
		return vars;
	};
	return new Map([...patterns.keys()].toSorted().map(id => [id, [...resolve(id, new Set())].toSorted()]));
}

/** How many times each item occurs. */
function counts(items: readonly string[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const item of items) out.set(item, (out.get(item) ?? 0) + 1);
	return out;
}

/**
 * The catalog's entries, refused when the runtime parser would skip any of it: an entry that
 * doesn't parse (a second definition of an id included, though the first parses), or a line that
 * starts no entry at all.
 */
export function parseCatalog(source: string, file: string): Entry[] {
	const entries = new FluentResource(source).body;
	const ids = entries.map(e => e.id);
	const parsed = counts(ids);
	const written = counts([...source.matchAll(ENTRY_START)].map(m => m[1] ?? ""));
	const dropped = [...written].filter(([id, n]) => n > (parsed.get(id) ?? 0)).map(([id]) => id);
	const strays = [...source.matchAll(LINE_START)]
		.map(m => m[0])
		.filter(line => !new RegExp(ENTRY_START.source).test(line));
	const twice = [...parsed].filter(([, n]) => n > 1).map(([id]) => id);
	const problems = [
		...dropped.map(id => `${file}: ${id} doesn't parse as Fluent`),
		...strays.map(line => `${file}: "${line}" starts no entry`),
		...twice.map(id => `${file}: ${id} is there twice`),
	];
	if (problems.length > 0) throw new ValidationError(problems);
	return entries;
}

export function modelGen(source: string, file: string): string {
	const members = [...messageVariables(parseCatalog(source, file), file)].flatMap(([id, vars]) =>
		vars.length === 0
			? [`\t${key(id)}: undefined;`]
			: [`\t${key(id)}: {`, ...vars.map(v => `\t\t${key(v)}: string | number;`), "\t};"],
	);
	return [
		generatedFrom("model.ftl"),
		'import { Catalog } from "../kit/core/model";',
		"",
		sourceConst(source),
		"",
		// A type, not an interface: an interface has no index signature, so it isn't a Record.
		"export type Messages = {",
		...members,
		"};",
		"",
		"export const model = new Catalog<Messages>(SOURCE);",
		"",
	].join("\n");
}

/** Each plugin's model.gen.ts into `files`, and every place one may be into `owned`. */
export async function modelFiles(
	root: string,
	plugins: readonly { name: string }[],
	files: Map<string, string>,
	owned: string[],
): Promise<void> {
	for (const p of plugins) {
		const base = `plugins/${p.name}`;
		owned.push(`${base}/${MODEL_GEN}`);
		const ftl = join(root, base, MODEL);
		if (existsSync(ftl)) files.set(`${base}/${MODEL_GEN}`, modelGen(await readFile(ftl, "utf8"), `${base}/${MODEL}`));
	}
}
