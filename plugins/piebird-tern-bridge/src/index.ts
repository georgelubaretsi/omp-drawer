// piebird-tern-bridge in omp: the tern_lua tool, which runs Lua in the Tern window holding this
// omp's pane through the plugin's Tern half (so.stencil.tern/; omp's side is src/bridge.ts), and
// the Tern half kept installed.
// Its answers and errors are core's (core/output.ts).
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { Outcome } from "../core/outcome";
import type { CallOptions } from "./bridge";
import { join } from "node:path";
import { model } from "../core/model.gen";
import { operations } from "../core/operations.gen";
import { toolOutcome } from "../core/output";
import { isRemotePane, keepTernPart, ternBinary } from "../kit/omp/tern-part";
import { registerOperations } from "../kit/omp/tools";
import { bridgeDir, call } from "./bridge";

export const DEFAULT_TIMEOUT_S = 130;
export const MAX_TIMEOUT_S = 600;

/** What the tool works with: the Tern window's, or a test's. */
export interface Surroundings {
	/** This omp's pane in Tern. */
	readonly pane: number;
	/** The bridge's folder, and the Tern half's, to install it from. */
	readonly dir: string;
	readonly pluginDir: string;
	readonly call: (options: CallOptions) => Promise<Outcome>;
	readonly reload: () => Promise<void>;
	readonly appNapOn: () => boolean;
}

async function reloadTernPlugins(): Promise<void> {
	const tern = ternBinary();
	if (!tern) throw new Error(model.text("no-tern").text);
	const proc = Bun.spawn([tern, "plugin", "reload"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
	const timer = setTimeout(() => proc.kill(), 15_000);
	// Exit 1 also means some other plugin failed to load; the bridge can still be fine.
	await proc.exited;
	clearTimeout(timer);
}

/** On macOS, App Nap throttles a background Tern past its 50 ms plugin budget, which stops the bridge. */
function appNapOn(): boolean {
	if (process.platform !== "darwin") return false;
	const read = Bun.spawnSync(["defaults", "read", "so.stencil.tern", "NSAppSleepDisabled"], {
		stdout: "pipe",
		stderr: "ignore",
		timeout: 5000,
	});
	return read.stdout.toString().trim() !== "1";
}

/** The window to pin the next call to. */
function nextPin(outcome: Outcome, pinned: string | undefined): string | undefined {
	// A plugin reload gives every window a new token, so only then is the pin stale. (A pin that
	// goes stale otherwise, such as the window closing, is dropped by the next call.)
	if (outcome.kind === "answer") return outcome.window || undefined;
	const reloaded = outcome.kind === "indeterminate" && outcome.reloaded;
	return outcome.kind === "not_loaded" || outcome.kind === "unclaimed" || reloaded ? undefined : pinned;
}

function fieldsOf(input: unknown): Readonly<Record<string, unknown>> {
	return typeof input === "object" && input !== null ? { ...input } : {};
}

export function ternInOmp(pi: ExtensionAPI, at: Surroundings): void {
	// The window that answered last; later calls stay there (and on its `state`) while it listens.
	let window: string | undefined;
	pi.setLabel("Tern");
	registerOperations(pi, operations, () => ({
		async lua(input, signal) {
			const { code, timeout_s: asked } = fieldsOf(input);
			const timeoutS = Math.min(Math.max(typeof asked === "number" ? asked : DEFAULT_TIMEOUT_S, 1), MAX_TIMEOUT_S);
			const options = {
				dir: at.dir,
				pane: at.pane,
				code: typeof code === "string" ? code : "",
				timeoutMs: timeoutS * 1000,
				reload: at.reload,
			};
			const cancel = signal instanceof AbortSignal ? { signal } : {};
			const outcome = await at.call({ ...options, ...cancel, ...(window ? { window } : {}) });
			window = nextPin(outcome, window);
			return toolOutcome(outcome, {
				pane: at.pane,
				dir: at.dir,
				pluginDir: at.pluginDir,
				timeoutS,
				appNapOn: at.appNapOn,
			});
		},
	}));
}

export default function ternExtension(pi: ExtensionAPI): void {
	keepTernPart(pi, "piebird-tern-bridge");
	// The Tern half wakes through named pipes, which it only sets up on macOS and Linux.
	if (process.env.TERM_PROGRAM !== "tern" || process.platform === "win32") return;
	// On a remote host the bridge's files would land on that host, while the window showing the
	// pane runs on another machine; Tern never lets a remote host run code in that window.
	if (isRemotePane(process.env.TERN_IDENTITY)) return;
	const pane = Number(process.env.TERN_PANE);
	if (!Number.isFinite(pane)) return;
	const pluginDir = join(import.meta.dir, "..", "so.stencil.tern");
	ternInOmp(pi, { pane, dir: bridgeDir(), pluginDir, call, reload: reloadTernPlugins, appNapOn });
}
