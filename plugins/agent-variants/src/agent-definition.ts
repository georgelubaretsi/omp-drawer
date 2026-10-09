import { parseDocument, type Document } from "yaml";
import type { TemporaryAgentMetadata, ThinkingLevel } from "./domain";

interface ParsedAgentDefinition {
	document: Document.Parsed;
	body: string;
}

export interface VariantOptions {
	name: string;
	role: string;
	requestedModel: string;
	createdAt: string;
	thinking?: ThinkingLevel;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseAgentDefinition(content: string): ParsedAgentDefinition {
	const match = FRONTMATTER.exec(content);
	if (!match) throw new Error("Agent definition must contain YAML frontmatter.");
	const document = parseDocument(match[1]);
	if (document.errors.length > 0) throw new Error(`Invalid agent frontmatter: ${document.errors[0]?.message}`);
	return { document, body: match[2] ?? "" };
}

function requiredString(document: Document.Parsed, field: string): string {
	const value = document.get(field);
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Agent frontmatter requires a non-empty ${field}.`);
	}
	return value.trim();
}

export function readAgentName(content: string): string {
	return requiredString(parseAgentDefinition(content).document, "name");
}

export function createAgentVariant(content: string, options: VariantOptions): string {
	const { document, body } = parseAgentDefinition(content);
	const sourceAgent = requiredString(document, "name");
	requiredString(document, "description");

	document.set("name", options.name);
	document.set("description", `Temporary ${sourceAgent} variant for ${options.requestedModel}`);
	document.set("model", `@${options.role}`);
	if (options.thinking) {
		document.delete("thinking");
		document.set("thinking-level", options.thinking);
	}
	document.set("x-omp-temporary", true);
	document.set("x-omp-source-agent", sourceAgent);
	document.set("x-omp-created-at", options.createdAt);
	document.set("x-omp-requested-model", options.requestedModel);
	document.set("x-omp-role", options.role);

	return `---\n${document.toString()}---\n\n${body.replace(/^\r?\n/, "")}`;
}

export function readTemporaryAgent(content: string): TemporaryAgentMetadata | undefined {
	const { document } = parseAgentDefinition(content);
	if (document.get("x-omp-temporary") !== true) return undefined;

	const name = requiredString(document, "name");
	const sourceAgent = requiredString(document, "x-omp-source-agent");
	const requestedModel = requiredString(document, "x-omp-requested-model");
	const createdAt = requiredString(document, "x-omp-created-at");
	const role = requiredString(document, "x-omp-role");
	return { name, sourceAgent, requestedModel, createdAt, role };
}
