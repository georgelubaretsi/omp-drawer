import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { bridgeDir, call, isRemotePane, type Outcome } from "./bridge";
import { answerText, failureText } from "./output";
import { templates } from "./templates";

const MACOS_APP_BINARY = "/Applications/Tern.app/Contents/MacOS/tern";
const DEFAULT_TIMEOUT_S = 130;
const MAX_TIMEOUT_S = 600;

function ternBinary(): string | undefined {
	return process.env.TERN_BIN ?? Bun.which("tern") ?? (existsSync(MACOS_APP_BINARY) ? MACOS_APP_BINARY : undefined);
}

async function reloadTernPlugins(): Promise<void> {
	const tern = ternBinary();
	if (!tern) throw new Error(templates.errors.noTern.render());
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
	if (
		outcome.kind === "not_loaded" ||
		outcome.kind === "unclaimed" ||
		(outcome.kind === "indeterminate" && outcome.reloaded)
	)
		return undefined;
	return pinned;
}

export default function ternExtension(pi: ExtensionAPI) {
	// The Tern half wakes through named pipes, which it only sets up on macOS and Linux.
	if (process.env.TERM_PROGRAM !== "tern" || process.platform === "win32") return;
	// On a remote host the bridge's files would land on that host, while the window showing the
	// pane runs on another machine; Tern never lets a remote host run code in that window.
	if (isRemotePane(process.env.TERN_IDENTITY)) return;
	const pane = Number(process.env.TERN_PANE);
	if (!Number.isFinite(pane)) return;

	// The window that answered last; later calls stay there (and on its `state`) while it listens.
	let window: string | undefined;

	const z = pi.zod;
	const { tool } = templates;
	pi.setLabel(tool.text("plugin"));
	const timeoutLimits = { defaultSeconds: DEFAULT_TIMEOUT_S, maxSeconds: MAX_TIMEOUT_S };
	const parameters = z.object({
		code: z.string().describe(tool.text("parameters.code")),
		timeout_s: z.number().optional().describe(tool.text("parameters.timeout", timeoutLimits)),
	});
	type ToolParameters = (typeof parameters)["infer"];

	pi.registerTool<typeof parameters>({
		name: "tern_lua",
		label: tool.text("label"),
		description: tool.render(),
		parameters,
		loadMode: "essential",
		approval: "exec",
		async execute(_toolCallId, params: ToolParameters, signal) {
			const timeoutS = Math.min(Math.max(params.timeout_s ?? DEFAULT_TIMEOUT_S, 1), MAX_TIMEOUT_S);
			const dir = bridgeDir();
			const outcome = await call({
				dir,
				pane,
				code: params.code,
				timeoutMs: timeoutS * 1000,
				reload: reloadTernPlugins,
				signal,
				window,
			});
			window = nextPin(outcome, window);
			if (outcome.kind !== "answer") throw new Error(failureText(outcome, { pane, dir, timeoutS, appNapOn }));
			return { content: [{ type: "text", text: answerText(outcome) }], details: { pane, ok: true } };
		},
	});
}
