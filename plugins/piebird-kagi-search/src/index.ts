// piebird-kagi-search in omp: the Kagi tools, performed by the plugin's vault, and the "search"
// setting (core/search.ts) applied to omp's built-in web_search, which is hidden while it should
// stay out of the way. The model's instructions about searching go into the system prompt.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { Io } from "../kit/core/io";
import type { Search } from "../core/search";
import { homedir } from "node:os";
import { join } from "node:path";
import { handlersFor } from "../core/handlers";
import { operations } from "../core/operations.gen";
import { builtInOff, instructions, PLUGIN, readSearch, VAULT } from "../core/search";
import { bunIo } from "../kit/bun/io";
import { vaultPath } from "../kit/core/vault";
import { ompChoices } from "../kit/omp/settings";
import { addToSystemPrompt } from "../kit/omp/prompt";
import { registerOperations } from "../kit/omp/tools";

/** omp's built-in search tool. */
export const BUILT_IN = "web_search";

/** What the extension works with: omp's and the system's, or a test's. */
export interface Surroundings {
	readonly io: Io;
	readonly home: string;
	/** The plugin's folder, whose native/ holds the vault. */
	readonly plugin: string;
	readonly windows: boolean;
	/** omp's own choice for "search" (`omp plugin config`) in a session working in `cwd`. */
	ompChoice(cwd: string): string | undefined;
}

export function kagiInOmp(pi: ExtensionAPI, at: Surroundings): void {
	let search: Search | undefined;
	let kagiFailed = false;
	/** Whether this part took web_search out of the active tools, so it alone puts it back. */
	let hidden = false;
	/** Hides web_search while the setting wants it out of the way, and shows it again after. */
	const apply = async () => {
		const active = pi.getActiveTools();
		const shown = active.includes(BUILT_IN);
		if (shown) hidden = false;
		const off = search !== undefined && builtInOff(search, kagiFailed);
		if (off && shown) {
			hidden = true;
			await pi.setActiveTools(active.filter(name => name !== BUILT_IN));
		} else if (!off && hidden) {
			hidden = false;
			await pi.setActiveTools([...active, BUILT_IN]);
		}
	};
	const handlers = handlersFor(at.io, vaultPath(at.plugin, VAULT, at.windows), () => {
		kagiFailed = true;
		void apply();
	});
	pi.setLabel("Kagi");
	registerOperations(pi, operations, () => handlers);

	// One omp process can go through several sessions, each in its own project with its own setting.
	pi.on("session_start", async (_event, ctx) => {
		const place = { home: at.home, project: ctx.cwd, plugin: at.plugin };
		kagiFailed = false;
		search = await readSearch(at.io, place, at.ompChoice(ctx.cwd)).catch(() => undefined);
		await apply();
	});
	addToSystemPrompt(pi, async () => (search === undefined ? undefined : instructions(search)));
}

export default function kagiSearch(pi: ExtensionAPI): void {
	kagiInOmp(pi, {
		io: bunIo(),
		home: homedir(),
		plugin: join(import.meta.dir, ".."),
		windows: process.platform === "win32",
		ompChoice: cwd => ompChoices(PLUGIN, cwd).search,
	});
}
