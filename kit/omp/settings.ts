// omp's own choices for a plugin's settings (`omp plugin config <plugin> set <key> <value>`), the
// agent level of core's settings (../core/settings.ts). omp gives extensions no way to read them,
// so they are read where omp writes them: the project's .omp/plugin-overrides.json over the
// person's plugins lock file, key by key, as omp merges them. The build copies kit/ into each
// plugin that needs it (plugins/<name>/kit/); edit it in kit/.
import { readFileSync } from "node:fs";
import { getPluginsLockfile, getProjectPluginOverridesPath } from "@oh-my-pi/pi-utils";

/** The two omp plugins files' texts; undefined when one can't be read. */
export interface OmpPluginFiles {
	readonly project?: string;
	readonly user?: string;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The text values in one file's `settings.<plugin>`; none when the file isn't that shape. */
function choicesIn(text: string | undefined, plugin: string): Record<string, string> {
	if (text === undefined) return {};
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return {};
	}
	const settings = record(json) ? json.settings : undefined;
	const own = record(settings) ? settings[plugin] : undefined;
	if (!record(own)) return {};
	return Object.fromEntries(
		Object.entries(own).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);
}

/** omp's choices for `plugin` from the files' texts: the project's over the person's, per key. */
export function ompChoicesFrom(plugin: string, files: OmpPluginFiles): Record<string, string | undefined> {
	return { ...choicesIn(files.user, plugin), ...choicesIn(files.project, plugin) };
}

function readOrUndefined(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

/** omp's choices for `plugin`'s settings in a session working in `cwd`. */
export function ompChoices(plugin: string, cwd: string): Record<string, string | undefined> {
	return ompChoicesFrom(plugin, {
		project: readOrUndefined(getProjectPluginOverridesPath(cwd)),
		user: readOrUndefined(getPluginsLockfile()),
	});
}
