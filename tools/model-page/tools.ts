// A tool as a harness gives it to the model, whichever shell registered it.
import type { Operations } from "../../kit/core/operations";
import type { Seen } from "./types";

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? Object.fromEntries(Object.entries(value))
		: undefined;
}

function textOf(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export interface ToolShape {
	/** The name the model calls it by in this harness. */
	readonly name: string;
	/** The plugin's own name for it (operations.json), which a harness may prefix. */
	readonly plain: string;
	readonly description: string;
	/** Its input's JSON Schema, each argument with its description. */
	readonly schema: unknown;
}

/** The tool as the model gets it, with the catalog messages of its description and arguments. */
export function describedTool(
	tool: ToolShape,
	operations: Operations | undefined,
	shown: "always" | "on search",
): Seen {
	const properties = record(record(tool.schema)?.properties) ?? {};
	const parameters = Object.fromEntries(
		Object.entries(properties).map(([name, schema]) => [name, textOf(record(schema)?.description)]),
	);
	const op = operations?.tools.find(o => o.tool.name === tool.plain);
	const ids = op === undefined ? [] : [op.id, ...Object.keys(parameters).map(name => `${op.id}.${name}`)];
	return { kind: "tool", name: tool.name, description: tool.description, parameters, shown, ids };
}
