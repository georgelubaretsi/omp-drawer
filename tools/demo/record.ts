// `bun tools/demo/record.ts <demo> [--out <dir>] [--keep] [--no-video]`: runs the demo's scenario,
// demos/<demo>/scenario.ts (a plugin's demo, `<plugin>`, or one of its feature demos,
// `<plugin>/<feature>`), and writes demo.mp4, demo.webp and report.md (what the agent did for each
// prompt) into demos/<demo>/, or `--out`; `--no-video` writes only the report, for working on what
// the plugin tells the agent. In the demo machine, vm/run.ts starts it (`just demo <demo>`), with
// the credentials the scenario names as JSON on stdin (place-machine.ts); on this Mac (`just
// demo-host <demo>`) it needs Tern signed in, omp signed in and ffmpeg, and a window opens and
// takes focus while it runs (place-host.ts). `--keep` leaves the sandbox folder behind for a look.
// It exits 1 when a tool call failed, or when a recording on this Mac shows its login name.
import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { compose } from "./compose";
import { Demo, type Recording } from "./director";
import { journalsOf } from "./harness";
import { machineSandbox, onDemoMachine } from "./place-machine";
import { hostSandbox } from "./place-host";
import { timesShowing } from "./onscreen";
import { report } from "./report";
import type { Credential, Sandbox, SandboxOptions } from "./sandbox";
import { TernWindow } from "./window";

/** A demo: what its sandbox needs, how to fill the project, and what happens on screen. */
export interface Scenario extends Omit<SandboxOptions, "market" | "secrets"> {
	/** The window's size in logical pixels; 540 wide fills the 1080-pixel video at 2×. */
	size?: [number, number];
	/** Fills the sandbox (the project, the omp home) before the window opens. */
	setup?: (s: Sandbox) => Promise<void>;
	run: (d: Demo) => Promise<void>;
}

const MARKET = join(import.meta.dir, "..", "..");

export function isScenario(value: unknown): value is Scenario {
	return !!value && typeof value === "object" && "run" in value && "plugins" in value;
}

/** The scenario of `demo`, demos/<demo>/scenario.ts. */
export async function loadScenario(demo: string): Promise<Scenario> {
	const file = join(MARKET, "demos", demo, "scenario.ts");
	const mod: unknown = await import(file);
	const loaded: unknown = mod && typeof mod === "object" ? Reflect.get(mod, "default") : undefined;
	if (!isScenario(loaded)) throw new Error(`${file} has no default Scenario export`);
	return loaded;
}

/**
 * The credentials vm/run.ts gives the demo machine's recorder on stdin (JSON, credential →
 * secret), when the demo needs one. On this Mac the host place reads them itself (credentials.ts),
 * and stdin is the terminal, which never ends.
 */
async function secrets(needed: readonly Credential[]): Promise<Partial<Record<Credential, string>>> {
	if (needed.length === 0 || !onDemoMachine()) return {};
	const given: unknown = JSON.parse((await Bun.stdin.text()) || "{}");
	return Object.fromEntries(needed.map(name => [name, String(Reflect.get(Object(given), name) ?? "")]));
}

/** Writes report.md and, unless `video` is off, the video into `out`; false when the agent stumbled. */
async function save(demo: string, recording: Recording, opts: { width: number; out: string; video: boolean }) {
	const { page, summary, stumbled } = report(demo, recording.prompts);
	await mkdir(opts.out, { recursive: true });
	await writeFile(join(opts.out, "report.md"), page);
	console.log(`${demo}: ${summary}`);
	if (opts.video) {
		await compose(recording, opts.width, { mp4: join(opts.out, "demo.mp4"), webp: join(opts.out, "demo.webp") });
		console.log(`wrote demo.mp4, demo.webp and report.md in ${opts.out}`);
	}
	if (stumbled) console.error(stumbled);
	return !stumbled;
}

/**
 * Whether a recording made on this Mac shows the login name, which an agent listing files with
 * their owner prints: such a recording gets no video, and an earlier one in `out` goes too, so
 * none that might show it is left to post. A recording in the demo machine shows its own user.
 */
async function showsLogin(recording: Recording, out: string): Promise<boolean> {
	if (onDemoMachine()) return false;
	const login = userInfo().username;
	const shown = await timesShowing(recording.frames, login);
	if (shown.length === 0) return false;
	console.error(`the login name ${login} is on screen at ${shown.join(", ")} s: no video; record again`);
	await Promise.all(["demo.mp4", "demo.webp"].map(f => rm(join(out, f), { force: true })));
	return true;
}

/** omp's journals of a run that failed or stumbled, and what the window last showed when it failed. */
async function keepClues(s: Sandbox, recording: Recording, out: string, run: { failed: boolean; clean: boolean }) {
	if (run.failed || !run.clean) await cp(journalsOf(s, "omp").dir, join(out, "journals"), { recursive: true });
	const last = recording.frames.at(-1)?.path;
	if (run.failed && last) await copyFile(last, join(out, "failure.png"));
}

async function record(demo: string, opts: { out: string; keep: boolean; video: boolean }): Promise<boolean> {
	const scenario = await loadScenario(demo);
	const [width, height] = scenario.size ?? [540, 525];
	const sandboxOptions = { ...scenario, market: MARKET, secrets: await secrets(scenario.credentials ?? []) };
	const sandbox = await (onDemoMachine() ? machineSandbox : hostSandbox)(sandboxOptions);
	let window: TernWindow | undefined;
	try {
		await scenario.setup?.(sandbox);
		window = await TernWindow.open(sandbox, width, height);
		await window.ctl("ready");
		const director = new Demo(window, sandbox);
		director.start();
		const failure = await scenario.run(director).then(
			() => undefined,
			(error: unknown) => (error instanceof Error ? error : new Error(String(error))),
		);
		const recording = await director.stop();
		const leaks = await showsLogin(recording, opts.out);
		// A run that failed or stumbled still gets its report, the clue to what went wrong. From the
		// demo machine, which is gone afterwards, also omp's journals (each call's arguments and
		// result) and what the window last showed (failure.png); on this Mac, `--keep` keeps them.
		// Its video, only when it didn't fail and shows nothing private.
		const video = opts.video && !failure && !leaks;
		const clean = (await save(demo, recording, { width, out: opts.out, video })) && !leaks;
		if (onDemoMachine()) await keepClues(sandbox, recording, opts.out, { failed: !!failure, clean });
		if (failure) throw failure;
		return clean;
	} finally {
		await window?.close();
		await sandbox.close(opts.keep);
		if (opts.keep) console.log(`kept the sandbox: ${sandbox.root}`);
	}
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { out: { type: "string" }, keep: { type: "boolean" }, "no-video": { type: "boolean" } },
	});
	const [demo, ...extra] = positionals;
	if (!demo || extra.length > 0) {
		console.error("usage: bun tools/demo/record.ts <demo> [--out <dir>] [--keep] [--no-video]");
		process.exit(2);
	}
	const out = values.out ?? join(MARKET, "demos", demo);
	const clean = await record(demo, { out, keep: values.keep === true, video: values["no-video"] !== true });
	process.exit(clean ? 0 : 1);
}
