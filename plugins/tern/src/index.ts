import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { bridgeDir, call, isRemotePane, MAX_REQUEST_BYTES, type Outcome } from "./bridge";

const TERN_PLUGIN_DIR = join(import.meta.dir, "..", "tern-plugin");
const MACOS_APP_BINARY = "/Applications/Tern.app/Contents/MacOS/tern";
const DEFAULT_TIMEOUT_S = 130;
const MAX_TIMEOUT_S = 600;
const MAX_OUTPUT_CHARS = 60_000;

function ternBinary(): string | undefined {
	return process.env.TERN_BIN ?? Bun.which("tern") ?? (existsSync(MACOS_APP_BINARY) ? MACOS_APP_BINARY : undefined);
}

async function reloadTernPlugins(): Promise<void> {
	const tern = ternBinary();
	if (!tern) throw new Error("the `tern` command was not found (set TERN_BIN)");
	const proc = Bun.spawn([tern, "plugin", "reload"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
	const timer = setTimeout(() => proc.kill(), 15_000);
	// Exit 1 also means some other plugin failed to load; the bridge can still be fine.
	await proc.exited;
	clearTimeout(timer);
}

/** On macOS, App Nap throttles a background Tern past its 50 ms plugin budget, which stops the bridge. */
function appNapHint(): string {
	if (process.platform !== "darwin") return "";
	const read = Bun.spawnSync(["defaults", "read", "so.stencil.tern", "NSAppSleepDisabled"], {
		stdout: "pipe",
		stderr: "ignore",
		timeout: 5000,
	});
	if (read.stdout.toString().trim() === "1") return "";
	return " App Nap is on for Tern, which can throttle a background Tern past its 50 ms plugin budget: ask the user to run `defaults write so.stencil.tern NSAppSleepDisabled -bool YES` and restart Tern.";
}

function describe(outcome: Exclude<Outcome, { kind: "answer" }>, pane: number, dir: string): string {
	switch (outcome.kind) {
		case "not_loaded":
			return `The omp-bridge Tern plugin is not loaded: its data folder ${dir} does not exist. Install it with: tern plugin link "${TERN_PLUGIN_DIR}" && tern plugin reload. If Tern runs with TERN_CONFIG_DIR, give omp the same value.`;
		case "unclaimed":
			return `No Tern window holding pane ${pane} (this omp's TERN_PANE) took the request, even after \`tern plugin reload\`; the code did not run. Is this pane's session open in a Tern window? Check \`tern plugin list\` and Tern's log.`;
		case "cancelled":
			return "Cancelled before Tern ran the code.";
		case "indeterminate":
			return `Outcome unknown: ${outcome.reason}. The code may have run partly or fully and was NOT retried; check the state it touches before running anything again.${outcome.reloaded ? ` Tern's plugins were reloaded, so the next call can run (\`state\` was reset).${appNapHint()}` : ""}`;
		case "too_large":
		default:
			return `The request is ${outcome.bytes} bytes once JSON-encoded; Tern reads at most ${MAX_REQUEST_BYTES}. Nothing was sent. Split the code into smaller calls, or keep large data in a file and read it with tern.fs.read.`;
	}
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

/** The tool's text for an answer; a Lua error throws. */
function answerText(outcome: Extract<Outcome, { kind: "answer" }>): string {
	const parts: string[] = [];
	if (outcome.printed) parts.push(`printed:\n${outcome.printed}`);
	if (outcome.ok) {
		parts.push(`result:\n${outcome.result === undefined ? "nil" : JSON.stringify(outcome.result, null, 2)}`);
		if (outcome.note) parts.push(`note: ${outcome.note}`);
	} else {
		parts.unshift(`Lua error: ${String(outcome.result)}`);
		throw new Error(parts.join("\n\n"));
	}
	const text = parts.join("\n\n");
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… truncated at ${MAX_OUTPUT_CHARS} of ${text.length} characters; return less (fields, a slice, a count)`;
}

const TOOL_DESCRIPTION = [
	"Run Lua in the Tern window that holds this omp's pane, with `cx`: the window API Carly's lua tool has",
	"(Tern agents in other panes, not omp subagents; sessions and layout, block reads, git, SQLite, notebooks, boards, browser, canvas, hosts, settings, actions, toasts).",
	"The first returned value comes back as JSON; returning an Awaitable (e.g. `return cx.git:status(repo)`) waits for it.",
	"`state` is a table kept between calls; `print` output is returned. Each call must finish its synchronous work within",
	"Tern's 50 ms plugin budget. Read the `tern` skill before first use.",
].join(" ");

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
	pi.setLabel("Tern");
	const parameters = z.object({
		code: z.string().describe("Luau chunk; `cx`, `state` and `print` are in scope; `return` the value you want back"),
		timeout_s: z
			.number()
			.optional()
			.describe(`Seconds to wait for the answer (default ${DEFAULT_TIMEOUT_S}, max ${MAX_TIMEOUT_S})`),
	});
	type ToolParameters = (typeof parameters)["infer"];

	pi.registerTool<typeof parameters>({
		name: "tern_lua",
		label: "Tern Lua",
		description: TOOL_DESCRIPTION,
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
			if (outcome.kind !== "answer") throw new Error(describe(outcome, pane, dir));
			return { content: [{ type: "text", text: answerText(outcome) }], details: { pane, ok: true } };
		},
	});
}
