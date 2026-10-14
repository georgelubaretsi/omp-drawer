// `bun tools/demo/vm/record.ts <demo> [--keep]` (from the workspace: `just demo-desktop <demo>`): runs a
// desktop demo, demos/<demo>/scenario.ts, in a throwaway macOS virtual machine and writes demo.mp4
// and demo.webp next to it. It needs tart (`TART` names it when it isn't on PATH) and the
// scenario's base image pulled. Nothing happens on this computer's own screen; `--keep` leaves
// the virtual machine stopped, for a look.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compose } from "../compose";
import { VmDemo } from "./director";
import { Guest } from "./guest";
import { Vnc } from "./vnc";

/** A desktop demo: the image it starts from, what it puts there first, and what happens on screen. */
export interface VmScenario {
	base: string;
	setup: (guest: Guest) => Promise<void>;
	run: (d: VmDemo) => Promise<void>;
}

const MARKET = join(import.meta.dir, "..", "..", "..");

function isScenario(value: unknown): value is VmScenario {
	return !!value && typeof value === "object" && "run" in value && "setup" in value && "base" in value;
}

/**
 * Waits for the screen to be drawn and hold still at one size: the server starts at its boot size
 * and announces the screen's own in its first updates, and a display left alone goes dark until
 * the pointer moves.
 */
async function steady(vnc: Vnc): Promise<void> {
	for (let i = 0; i < 30; i++) {
		const size = `${vnc.width}x${vnc.height}`;
		if (vnc.blank()) {
			vnc.pointer(4 + (i % 2), 4);
			await Promise.race([vnc.nextUpdate(), Bun.sleep(2000)]);
		}
		await vnc.settle(2000, 30_000);
		if (!vnc.blank() && size === `${vnc.width}x${vnc.height}`) return;
	}
	throw new Error("the virtual machine's screen never came up");
}

async function record(name: string, keep: boolean): Promise<void> {
	const folder = join(MARKET, "demos", name);
	// The scenario is picked by the demo name given on the command line.
	const mod: unknown = await import(join(folder, "scenario.ts"));
	const scenario: unknown = mod && typeof mod === "object" ? Reflect.get(mod, "default") : undefined;
	if (!isScenario(scenario)) throw new Error(`${folder}/scenario.ts has no default VmScenario export`);
	const guest = await Guest.start({ base: scenario.base, name: `piebird-demo-${name}`, vnc: true });
	const frames = mkdtempSync(join(tmpdir(), "piebird-vm-frames-"));
	let vnc: Vnc | undefined;
	try {
		await scenario.setup(guest);
		vnc = await Vnc.connect(guest.vncUrl);
		await steady(vnc);
		const demo = new VmDemo(vnc, guest, frames);
		demo.start();
		const failure = await scenario.run(demo).then(
			() => undefined,
			(e: unknown) => e,
		);
		// What the screen showed when it failed, with DEMO_SHOTS set: failure.png.
		if (failure) await demo.shot("failure");
		const recording = await demo.stop();
		if (failure) throw failure instanceof Error ? failure : new Error(JSON.stringify(failure));
		await compose(recording, vnc.width / 2, { mp4: join(folder, "demo.mp4"), webp: join(folder, "demo.webp") });
		console.log(`wrote demos/${name}/demo.mp4 and demo.webp`);
	} finally {
		vnc?.close();
		await guest.stop(keep);
		rmSync(frames, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const [name, ...rest] = process.argv.slice(2);
	if (!name) throw new Error("usage: bun tools/demo/vm/record.ts <demo> [--keep]");
	await record(name, rest.includes("--keep"));
}
