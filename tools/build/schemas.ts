// The schemas sources are validated against: the Agent Plugins 1.0.0 schemas vendored in
// reference/agent-plugins/1.0.0/ (refreshed by `bun tools/sync-references.ts agent-plugins`),
// tools/catalog.schema.json and tools/skill-frontmatter.schema.json.
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import mcpSchema from "../../reference/agent-plugins/1.0.0/mcp.schema.json" with { type: "json" };
import pluginSchema from "../../reference/agent-plugins/1.0.0/plugin.schema.json" with { type: "json" };
import catalogSchema from "../catalog.schema.json" with { type: "json" };
import skillSchema from "../skill-frontmatter.schema.json" with { type: "json" };
import { located, pointerToken } from "./json";

export const HOSTS = ["omp", "claude", "codex"] as const;
export type Host = (typeof HOSTS)[number];

export const PLUGIN_SCHEMA = pluginSchema.$id;
export const MCP_SCHEMA = mcpSchema.$id;

export interface CatalogEntry {
	name: string;
	category: string;
	hosts: Host[];
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
