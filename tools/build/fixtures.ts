// Shared fixtures for the build tests: temp source trees and the problems loadSources reports for them.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import mcpSchema from "../../reference/agent-plugins/1.0.0/mcp.schema.json" with { type: "json" };
import pluginSchema from "../../reference/agent-plugins/1.0.0/plugin.schema.json" with { type: "json" };
import { ValidationError } from "./json";
import { PLUGIN_SCHEMA } from "./schemas";
import { loadSources } from "./sources";

const roots: string[] = [];

/** Registers a temp folder for `cleanup`. */
export function track(root: string): void {
	roots.push(root);
}

/** Removes every temp folder made since the last call; each test file runs it afterEach. */
export async function cleanup(): Promise<void> {
	await Promise.all(roots.splice(0).map(r => rm(r, { recursive: true, force: true })));
}

export async function put(root: string, rel: string, value: unknown): Promise<void> {
	await mkdir(dirname(join(root, rel)), { recursive: true });
	await writeFile(join(root, rel), typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

/** Symlink at `rel` pointing to `target` (absolute, under the root). */
export async function link(root: string, target: string, rel: string): Promise<void> {
	await mkdir(dirname(join(root, rel)), { recursive: true });
	await symlink(join(root, target), join(root, rel));
}

export const CATALOG = {
	name: "demo-market",
	owner: { name: "Someone" },
	description: "Test catalog",
	plugins: [{ name: "demo", category: "development", hosts: ["omp"] }],
};
export const MANIFEST = { $schema: PLUGIN_SCHEMA, name: "demo", version: "1.0.0", description: "Demo plugin" };
/** A changelog with only an empty Unreleased section, valid for any version. */
export const CHANGELOG = "# Changelog\n\n## [Unreleased]\n";

/** A source tree with one plugin "demo" for the given hosts. */
export async function tree(hosts: string[]): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "omp-drawer-build-"));
	track(root);
	await put(root, "catalog.json", { ...CATALOG, plugins: [{ name: "demo", category: "development", hosts }] });
	await put(root, "plugins/demo/plugin.json", MANIFEST);
	await put(root, "plugins/demo/CHANGELOG.md", CHANGELOG);
	return root;
}

export async function problems(root: string): Promise<string[]> {
	try {
		await loadSources(root);
	} catch (e) {
		if (e instanceof ValidationError) return e.problems;
		throw e;
	}
	return [];
}

// The unmodified vendored schemas, to show which rejections are the schema's and which the spec prose's.
const plainAjv = new Ajv2020({ allErrors: true });
export const plainMcp = plainAjv.compile(mcpSchema);
export const plainPlugin = plainAjv.compile(pluginSchema);

export interface Case {
	name: string;
	value: unknown;
	/** Exact problems; none when valid. */
	errors?: string[];
	/** Which authority rejects it: the vendored schema, or a rule the spec leaves to prose (or this build's own). */
	by?: "schema" | "prose";
}
