// `bun tools/demo/record.ts <plugin> [--keep] [--no-video]` (from the repo root: `just demo
// <plugin>`): runs the plugin's demo, demos/<plugin>/scenario.ts, and writes demo.mp4, demo.webp
// and report.md (what the agent did for each prompt) next to it; `--no-video` writes only the
// report, for working on what the plugin tells the agent. It needs macOS with Tern installed and
// signed in, omp signed in (the sandbox borrows its sign-in through `omp auth-broker serve`),
// and ffmpeg. A window opens and takes focus while it runs; `--keep` leaves the sandbox folder
// behind for a look. It exits 1 when a tool call failed.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { compose } from "./compose";
import { Demo, type Recording } from "./director";
import { report } from "./report";
import { closeSandbox, createSandbox, type Sandbox, type SandboxOptions } from "./sandbox";
import { TernWindow } from "./window";

/** A demo: what its sandbox needs, how to fill the project, and what happens on screen. */
export interface Scenario extends Omit<SandboxOptions, "market"> {
	/** The window's size in logical pixels; 540 wide fills the 1080-pixel video at 2×. */
	size?: [number, number];
	/** Fills the sandbox (the project, the omp home) before the window opens. */
	setup?: (s: Sandbox) => Promise<void>;
	run: (d: Demo) => Promise<void>;
}

const MARKET = join(import.meta.dir, "..", "..");

function isScenario(value: unknown): value is Scenario {
	return !!value && typeof value === "object" && "run" in value && "plugins" in value;
}

/** Writes report.md and, unless `video` is off, the video; false when the agent stumbled. */
async function save(plugin: string, recording: Recording, width: number, video: boolean): Promise<boolean> {
	const folder = join(MARKET, "demos", plugin);
	const { page, summary, stumbled } = report(plugin, recording.prompts);
	await writeFile(join(folder, "report.md"), page);
	console.log(`${plugin}: ${summary}`);
	if (video) {
		await compose(recording, width, { mp4: join(folder, "demo.mp4"), webp: join(folder, "demo.webp") });
		console.log(`wrote demos/${plugin}/demo.mp4, demo.webp and report.md`);
	}
	if (stumbled) console.error(stumbled);
	return !stumbled;
}

async function record(plugin: string, opts: { keep: boolean; video: boolean }): Promise<boolean> {
	const folder = join(MARKET, "demos", plugin);
	// The scenario is picked by the plugin name given on the command line.
	const mod: unknown = await import(join(folder, "scenario.ts"));
	const loaded: unknown = mod && typeof mod === "object" ? Reflect.get(mod, "default") : undefined;
	if (!isScenario(loaded)) throw new Error(`${folder}/scenario.ts has no default Scenario export`);
	const [width, height] = loaded.size ?? [540, 525];
	const sandbox = await createSandbox({ ...loaded, market: MARKET });
	let window: TernWindow | undefined;
	try {
		await loaded.setup?.(sandbox);
		window = await TernWindow.open(sandbox, width, height);
		await window.ctl("ready");
		const demo = new Demo(window, sandbox);
		demo.start();
		const failure = await loaded.run(demo).then(
			() => undefined,
			(error: unknown) => (error instanceof Error ? error : new Error(String(error))),
		);
		const recording = await demo.stop();
		// A failed run still gets its report, the clue to what went wrong; its video doesn't.
		const clean = await save(plugin, recording, width, opts.video && !failure);
		if (failure) throw failure;
		return clean;
	} finally {
		await window?.close();
		await closeSandbox(sandbox, opts.keep);
		if (opts.keep) console.log(`kept the sandbox: ${sandbox.root}`);
	}
}

const FLAGS = ["--keep", "--no-video"];
const [plugin, ...flags] = process.argv.slice(2);
if (!plugin || flags.some(f => !FLAGS.includes(f))) {
	console.error("usage: bun tools/demo/record.ts <plugin> [--keep] [--no-video]");
	process.exit(2);
}
const clean = await record(plugin, { keep: flags.includes("--keep"), video: !flags.includes("--no-video") });
process.exit(clean ? 0 : 1);
