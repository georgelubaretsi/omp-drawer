// The schemas sources are validated against: the Agent Plugins 1.0.0 schemas vendored in
// reference/agent-plugins/1.0.0/ (refreshed by `bun tools/sync-references.ts agent-plugins`),
// tools/catalog.schema.json, tools/skill-frontmatter.schema.json, tools/settings.schema.json and
// tools/operations.schema.json.
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import mcpSchema from "../../reference/agent-plugins/1.0.0/mcp.schema.json" with { type: "json" };
import pluginSchema from "../../reference/agent-plugins/1.0.0/plugin.schema.json" with { type: "json" };
import catalogSchema from "../catalog.schema.json" with { type: "json" };
import operationsSchema from "../operations.schema.json" with { type: "json" };
import settingsSchema from "../settings.schema.json" with { type: "json" };
import skillSchema from "../skill-frontmatter.schema.json" with { type: "json" };
import { type JsonObject, located, pointerToken } from "./json";

/** The hosts the build writes a marketplace for. */
export const MARKET_HOSTS = ["omp", "claude", "codex"] as const;
export type MarketHost = (typeof MARKET_HOSTS)[number];
/** Every host a catalog entry may list. Tern has no marketplace: omp installs a plugin's Tern part (tern.ts). */
export const HOSTS = [...MARKET_HOSTS, "tern"] as const;
export type Host = (typeof HOSTS)[number];

export const PLUGIN_SCHEMA = pluginSchema.$id;
export const MCP_SCHEMA = mcpSchema.$id;

export interface CatalogEntry {
	name: string;
	category: string;
	hosts: Host[];
	/** Hosts whose part is still in development: left out of the manifest that host reads (host-parts.ts). */
	development?: Host[];
	/** The plugin's native program, built from cmd/<program>/ (native.ts); none when absent. */
	program?: string;
}

const ajv = new Ajv2020({ allErrors: true, verbose: true, discriminator: true });
export const validatePlugin = ajv.compile(pluginSchema);
// For error reporting only: `discriminator` makes Ajv report the errors of the server variant
// whose `type` matches instead of every variant's. Each variant requires `type` with a distinct
// const, so at most one variant can match and the accepted set is unchanged (build/mcp.test.ts
// checks the fixtures against the unmodified schema too).
export const validateMcp = ajv.compile({
	...mcpSchema,
	$defs: {
		...mcpSchema.$defs,
		server: { type: "object", discriminator: { propertyName: "type" }, ...mcpSchema.$defs.server },
	},
});
export const validateCatalog = ajv.compile<{ plugins: CatalogEntry[] }>(catalogSchema);
export const validateName = ajv.compile(catalogSchema.$defs.name);
export const validateSkill = ajv.compile(skillSchema);
/** A setting in a plugin's core/settings.json, as tools/settings.schema.json shapes it. */
export type SettingDeclaration =
	| {
			type: "choice";
			title: string;
			about: string;
			default: string;
			choices: { value: string; label: string; means: string }[];
	  }
	| { type: "text" | "path"; title: string; about: string; default: string };
/** A plugin's core/settings.json: its settings and secrets (each a title, about and env). */
export interface SettingsFile {
	settings?: Record<string, SettingDeclaration>;
	secrets?: Record<string, { title: string; about: string; env?: string }>;
}
export const validateSettings = ajv.compile<SettingsFile>(settingsSchema);
/** A tool's MCP annotations and Claude Code's alwaysLoad, as tools/operations.schema.json shapes them. */
export interface ToolDeclaration {
	name: string;
	readOnly?: boolean;
	destructive?: boolean;
	idempotent?: boolean;
	openWorld?: boolean;
	alwaysLoad?: boolean;
	runsCode?: boolean;
}
/** One operation in a plugin's core/operations.json. */
export interface OperationDeclaration {
	input: JsonObject;
	output: JsonObject;
	errors?: string[];
	vault?: boolean;
	tool?: ToolDeclaration;
}
/** A plugin's core/operations.json. */
export interface OperationsFile {
	operations: Record<string, OperationDeclaration>;
}
export const validateOperations = ajv.compile<OperationsFile>(operationsSchema);
export const validateServer = ajv.compile({ $ref: `${MCP_SCHEMA}#/$defs/server` });

/** The value the message names, for the keywords whose message leaves it out. */
function detail(e: ErrorObject): string {
	const params: Record<string, unknown> = e.params;
	switch (e.keyword) {
		case "additionalProperties":
			return `: ${JSON.stringify(params.additionalProperty)}`;
		case "const":
			return `: ${JSON.stringify(params.allowedValue)}`;
		case "enum": {
			const values: unknown = params.allowedValues;
			return Array.isArray(values) ? `: ${values.map((v: unknown) => JSON.stringify(v)).join(", ")}` : "";
		}
		case "not":
			return `: ${JSON.stringify(e.schema)}`;
		case "discriminator":
			return params.tagValue === undefined ? "" : `: ${JSON.stringify(params.tagValue)}`;
		default:
			return "";
	}
}

/** `<file>: <instancePath> <message>` per schema error; the message names the rule. */
export function schemaProblems(file: string, errors: ErrorObject[] | null | undefined, pathPrefix = ""): string[] {
	const out: string[] = [];
	for (const e of errors ?? []) {
		// Ajv's summary of the errors reported for the property name itself, just below.
		if (e.keyword === "propertyNames") continue;
		let path = pathPrefix + e.instancePath;
		if (e.propertyName !== undefined) path += `/${pointerToken(e.propertyName)}`;
		out.push(`${located(file, path)} ${e.message}${detail(e)}`);
	}
	return out;
}
