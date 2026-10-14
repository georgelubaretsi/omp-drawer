// The Place an omp extension lends core code; its Io is the Bun shells' (kit/bun/io.ts).
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Place } from "../core/io";

/** What the omp kit uses of omp's ExtensionContext (in `@oh-my-pi/pi-coding-agent`). */
export interface OmpContext {
	readonly cwd: string;
}

/** The session's folders: the person's home, the session's project, and the plugin's folder. */
export function ompPlace(ctx: OmpContext, pluginDir: string): Place {
	return { home: homedir(), project: ctx.cwd, plugin: resolve(pluginDir) };
}
