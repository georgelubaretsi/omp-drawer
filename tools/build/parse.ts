// Parsers keep the last of two equal keys without a word; a repeated key is usually a merge
// leftover. The JSON and YAML parsers below expose the syntax tree, where repeats are visible.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluate, parse as parseJson, type ValueNode } from "@humanwhocodes/momoa";
import { isMap, isScalar, isSeq, parseDocument } from "yaml";
import { located, pointerToken } from "./json";

/** Repeated member names in every object of a JSON syntax tree (momoa), compared after unescaping. */
function jsonDuplicates(file: string, node: ValueNode, pointer: string, problems: string[]): void {
	if (node.type === "Object") {
		const seen = new Set<string>();
		for (const member of node.members) {
			const key = member.name.type === "String" ? member.name.value : member.name.name;
			if (seen.has(key)) problems.push(`${located(file, pointer)} duplicate key ${JSON.stringify(key)}`);
			seen.add(key);
			jsonDuplicates(file, member.value, `${pointer}/${pointerToken(key)}`, problems);
		}
	} else if (node.type === "Array") {
		node.elements.forEach((element, i) => jsonDuplicates(file, element.value, `${pointer}/${i}`, problems));
	}
}

/** Repeated keys in every mapping of a YAML document (yaml), compared as the strings they become in JavaScript. */
function yamlDuplicates(file: string, node: unknown, pointer: string, problems: string[]): void {
	if (isMap(node)) {
		const seen = new Set<string>();
		for (const pair of node.items) {
			const key = String(isScalar(pair.key) ? pair.key.value : pair.key);
			if (seen.has(key)) problems.push(`${located(file, pointer)} duplicate key ${JSON.stringify(key)}`);
			seen.add(key);
			yamlDuplicates(file, pair.value, `${pointer}/${pointerToken(key)}`, problems);
		}
	} else if (isSeq(node)) {
		node.items.forEach((item, i) => yamlDuplicates(file, item, `${pointer}/${i}`, problems));
	}
}

/** Every JSON source goes through here: parsed with momoa, repeated keys reported, value returned. */
export async function readJson(root: string, rel: string, problems: string[]): Promise<unknown> {
	let text: string;
	try {
		text = await readFile(join(root, rel), "utf8");
	} catch {
		problems.push(`${rel}: cannot read file`);
		return undefined;
	}
	let body: ValueNode;
	try {
		body = parseJson(text, { mode: "json" }).body;
	} catch (e) {
		problems.push(`${rel}: invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
		return undefined;
	}
	jsonDuplicates(rel, body, "", problems);
	return evaluate(body);
}

/**
 * The YAML frontmatter of SKILL.md file `rel`, with repeated keys reported under `<rel> frontmatter`;
 * undefined, with the problem reported, when there is none or it doesn't parse.
 */
export function readFrontmatter(rel: string, text: string, problems: string[]): { value: unknown } | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	if (!match) {
		problems.push(`${rel}: must start with YAML frontmatter between "---" lines`);
		return undefined;
	}
	// uniqueKeys off: repeated keys are reported below with their path, like JSON's.
	const doc = parseDocument(match[1], { uniqueKeys: false });
	if (doc.errors.length > 0) {
		problems.push(`${rel}: invalid YAML frontmatter: ${doc.errors[0].message.split("\n")[0]}`);
		return undefined;
	}
	yamlDuplicates(`${rel} frontmatter`, doc.contents, "", problems);
	return { value: doc.toJS() };
}
