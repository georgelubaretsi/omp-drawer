// A plugin's operations (core/operations.json, tools/operations.schema.json). Past the schema, the
// build checks that each input and output is a JSON Schema Ajv compiles, that none carries text
// (what the model reads lives in core/model.ftl), that no two tools share a name, and that
// model.ftl says what each tool, each argument and each error is.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { generatedFrom, sourceConst } from "./gen-ts";
import { isObject, type JsonObject, pointerToken, ValidationError } from "./json";
import { MODEL, messageVariables, parseCatalog } from "./model";
import { readJson } from "./parse";
import { type OperationDeclaration, type OperationsFile, schemaProblems, validateOperations } from "./schemas";

export const OPERATIONS = "core/operations.json";

// The keywords whose value is text a reader sees: in an MCP tool's schema, that reader is the model.
const TEXT = ["title", "description", "examples"];
// Where JSON Schema 2020-12 keeps schemas inside a schema: by name, in a list, or as the value.
const NAMED = ["properties", "patternProperties", "$defs", "dependentSchemas"];
const LISTED = ["allOf", "anyOf", "oneOf", "prefixItems"];
const SINGLE = ["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames"];
const MORE = ["unevaluatedProperties", "unevaluatedItems"];

function inner(schema: JsonObject, at: string): [unknown, string][] {
	const out: [unknown, string][] = [];
	for (const k of NAMED) {
		const map = schema[k];
		if (isObject(map))
			out.push(...Object.entries(map).map(([n, s]): [unknown, string] => [s, `${at}/${k}/${pointerToken(n)}`]));
	}
	for (const k of LISTED) {
		const list = schema[k];
		if (Array.isArray(list)) out.push(...list.map((s, i): [unknown, string] => [s, `${at}/${k}/${i}`]));
	}
	for (const k of [...SINGLE, ...MORE]) out.push([schema[k], `${at}/${k}`]);
	return out;
}

/** Each text keyword in `schema` and the schemas inside it, as a JSON pointer. */
export function textKeywords(schema: unknown, at: string): string[] {
	if (!isObject(schema)) return [];
	const own = TEXT.filter(k => Object.hasOwn(schema, k)).map(k => `${at}/${k}`);
	return [...own, ...inner(schema, at).flatMap(([s, p]) => textKeywords(s, p))];
}

function schemaProblem(file: string, at: string, schema: JsonObject): string | undefined {
	try {
		new Ajv2020({ strict: true }).compile(schema);
		return undefined;
	} catch (e) {
		return `${file}: ${at} isn't a JSON Schema Ajv compiles: ${e instanceof Error ? e.message : String(e)}`;
	}
}

function declarationProblems(file: string, operations: Record<string, OperationDeclaration>): string[] {
	const out: string[] = [];
	const tools = new Map<string, string>();
	for (const [id, op] of Object.entries(operations)) {
		const parts: [string, JsonObject][] = [
			["input", op.input],
			["output", op.output],
		];
		for (const [part, schema] of parts) {
			const at = `/operations/${id}/${part}`;
			const bad = schemaProblem(file, at, schema);
			if (bad) out.push(bad);
			for (const p of textKeywords(schema, at)) out.push(`${file}: ${p}: text the model reads goes in ${MODEL}`);
		}
		const name = op.tool?.name;
		if (name === undefined) continue;
		const other = tools.get(name);
		if (other) out.push(`${file}: /operations/${id}/tool/name "${name}" is ${other}'s too`);
		tools.set(name, id);
	}
	return out;
}

/** What model.ftl lacks, or has to spare, for the tools and errors in `operations`. */
export function textProblems(operations: Record<string, OperationDeclaration>, ids: ReadonlySet<string>): string[] {
	const out: string[] = [];
	for (const [id, op] of Object.entries(operations)) {
		for (const e of op.errors ?? [])
			if (!ids.has(`error-${e}`)) out.push(`error-${e} is missing: what the error ${e} means`);
		if (!op.tool) continue;
		if (!ids.has(id)) out.push(`${id} is missing, or has no value: what the tool ${op.tool.name} does`);
		const args = Object.keys(isObject(op.input.properties) ? op.input.properties : {});
		for (const a of args)
			if (!ids.has(`${id}.${a}`)) out.push(`${id}.${a} is missing: what the argument ${a} is for`);
		for (const attr of [...ids].filter(m => m.startsWith(`${id}.`))) {
			if (!args.includes(attr.slice(id.length + 1))) out.push(`${attr} names no argument of ${id}`);
		}
	}
	return out;
}

async function pluginProblems(root: string, name: string): Promise<string[]> {
	const file = `plugins/${name}/${OPERATIONS}`;
	if (!existsSync(join(root, file))) return [];
	const problems: string[] = [];
	const parsed = await readJson(root, file, problems);
	if (parsed === undefined) return problems;
	if (!validateOperations(parsed)) return schemaProblems(file, validateOperations.errors);
	const { operations }: OperationsFile = parsed;
	const out = declarationProblems(file, operations);
	const ftl = join(root, `plugins/${name}`, MODEL);
	const needsText = Object.values(operations).some(op => op.tool !== undefined || (op.errors?.length ?? 0) > 0);
	if (!needsText) return out;
	if (!existsSync(ftl)) return [...out, `${file}: its tools and errors need their text in ${MODEL}`];
	const model = `plugins/${name}/${MODEL}`;
	const ids = new Set(messageVariables(parseCatalog(await readFile(ftl, "utf8"), model), model).keys());
	return [...out, ...textProblems(operations, ids).map(p => `${model}: ${p}`)];
}

export async function operationProblems(root: string, plugins: readonly { name: string }[]): Promise<string[]> {
	return (await Promise.all(plugins.map(p => pluginProblems(root, p.name)))).flat();
}

export const OPERATIONS_GEN = "core/operations.gen.ts";

/**
 * operations.gen.ts for `file` (operations.json, validated): the file without `$schema`, and each
 * tool's text and its arguments' from model.gen.ts, by literal id so a wrong one fails to compile.
 */
export function operationsGen(file: OperationsFile): string {
	const { $schema: _schema, ...rest } = file as OperationsFile & { $schema?: unknown };
	const ids = Object.entries(file.operations).flatMap(([id, op]) =>
		op.tool
			? [id, ...Object.keys(isObject(op.input.properties) ? op.input.properties : {}).map(a => `${id}.${a}`)]
			: [],
	);
	return [
		generatedFrom("operations.json"),
		'import type { ModelText } from "../kit/core/model";',
		'import { parseOperations } from "../kit/core/operations";',
		// Without tools there is no text to take, and maybe no model.gen.ts.
		...(ids.length > 0 ? ['import { model } from "./model.gen";'] : []),
		"",
		sourceConst(JSON.stringify(rest)),
		"",
		"const text = new Map<string, ModelText>();",
		...ids.toSorted().map(id => `text.set(${JSON.stringify(id)}, model.text(${JSON.stringify(id)}));`),
		"",
		"export const operations = parseOperations(SOURCE, text);",
		"",
	].join("\n");
}

/** Each plugin's operations.gen.ts into `files`, and every place one may be into `owned`. */
export async function operationsFiles(
	root: string,
	plugins: readonly { name: string }[],
	files: Map<string, string>,
	owned: string[],
): Promise<void> {
	for (const p of plugins) {
		const base = `plugins/${p.name}`;
		owned.push(`${base}/${OPERATIONS_GEN}`);
		const file = `${base}/${OPERATIONS}`;
		if (!existsSync(join(root, file))) continue;
		// plan has run operationProblems first, so the file is valid; this only narrows its type.
		const parsed = await readJson(root, file, []);
		if (!validateOperations(parsed)) throw new ValidationError(schemaProblems(file, validateOperations.errors));
		files.set(`${base}/${OPERATIONS_GEN}`, operationsGen(parsed));
	}
}
