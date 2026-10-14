// What a recording made on this Mac must not show: this Mac's login name, which an agent prints
// whenever it lists files with their owner (`ls -l`). The demo machine's user is its own, so only
// recordings on this Mac are read: what the window showed, twice a second, with tesseract (the dev
// shell's).
import type { Frame } from "./director";

/** Every `every` ms of the recording, the frame shown then. */
function sampled(frames: readonly Frame[], every: number): Frame[] {
	const out: Frame[] = [];
	for (const f of frames) if (out.length === 0 || f.t - (out.at(-1)?.t ?? 0) >= every) out.push(f);
	return out;
}

async function textOf(path: string): Promise<string> {
	const proc = Bun.spawn(["tesseract", path, "-"], { stdout: "pipe", stderr: "ignore" });
	const [text, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
	if (code !== 0) throw new Error(`tesseract couldn't read ${path}`);
	return text;
}

/** Whether `text` holds `word` as a word of its own, in any case. */
export function shows(text: string, word: string): boolean {
	const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "iu").test(text);
}

/** The times (seconds) at which the recording shows `word`, read four frames at a time. */
export async function timesShowing(frames: readonly Frame[], word: string, every = 500): Promise<number[]> {
	const queue = sampled(frames, every);
	const found: number[] = [];
	const worker = async () => {
		for (let f = queue.shift(); f !== undefined; f = queue.shift())
			if (shows(await textOf(f.path), word)) found.push(Math.round(f.t / 100) / 10);
	};
	await Promise.all(Array.from({ length: 4 }, worker));
	return found.toSorted((a, b) => a - b);
}
