// Turns a recording into the demo files: an MP4 at 1080×1350 (4:5, what X shows best on a phone),
// the window on top and a caption band below, with the events drawn over it, at 30 frames a
// second; and an animated WebP from it, small enough to play inline in a README.
import { type Image, type SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import type { FileSink } from "bun";
import type { DemoEvent, Recording } from "./director";

const W = 1080;
const H = 1350;
const FPS = 30;
/** The most of the window shown; the rest of the height is the caption band. */
const MAX_APP = 1050;
const ACCENT = "#5b9cff";
const TEXT = "#f5f6f8";
const QUIET = "#a0a6b2";
const FONT = "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif";

type Of<K extends DemoEvent["kind"]> = Extract<DemoEvent, { kind: K }>;

/** A drawing context and the window's placement: its pixels per logical pixel, and the band's top. */
interface Stage {
	g: SKRSContext2D;
	scale: number;
	band: number;
	events: DemoEvent[];
	end: number;
}

const fade = (t: number, from: number, to: number, ms = 200) =>
	t < from || t > to ? 0 : Math.max(0, Math.min(1, (t - from) / ms, (to - t) / ms));

/** Each event of `kind`, with the time the next one of the same kind (or the end) starts. */
function spans<K extends DemoEvent["kind"]>(s: Stage, kind: K): [Of<K>, number][] {
	const list = s.events.filter((e): e is Of<K> => e.kind === kind);
	return list.map((e, i) => [e, list[i + 1]?.t ?? s.end]);
}

function wrap(g: SKRSContext2D, text: string, width: number): string[] {
	const lines = [""];
	for (const word of text.split(/\s+/)) {
		const trial = `${lines.at(-1)} ${word}`.trim();
		if (g.measureText(trial).width <= width || lines.at(-1) === "") lines[lines.length - 1] = trial;
		else lines.push(word);
	}
	return lines;
}

function drawCaptions(s: Stage, t: number): void {
	const { g } = s;
	for (const [e, until] of spans(s, "caption")) {
		const alpha = fade(t, e.t, until);
		if (!alpha) continue;
		g.font = `bold 50px ${FONT}`;
		const main = wrap(g, e.text, W - 80).map(line => ({ line, font: `bold 50px ${FONT}`, color: TEXT, h: 62 }));
		g.font = `38px ${FONT}`;
		const sub = e.sub
			? wrap(g, e.sub, W - 80).map(line => ({ line, font: `38px ${FONT}`, color: QUIET, h: 50 }))
			: [];
		const lines = [...main, ...sub];
		let y = s.band + (H - s.band - lines.reduce((sum, l) => sum + l.h, 0)) / 2;
		g.globalAlpha = alpha;
		g.textAlign = "center";
		g.textBaseline = "middle";
		for (const l of lines) {
			g.font = l.font;
			g.fillStyle = l.color;
			g.fillText(l.line, W / 2, y + l.h / 2);
			y += l.h;
		}
		g.globalAlpha = 1;
	}
}

function drawKeys(s: Stage, t: number): void {
	const { g } = s;
	for (const e of s.events.filter((x): x is Of<"key"> => x.kind === "key")) {
		const alpha = fade(t, e.t, e.t + 1100, 150);
		if (!alpha) continue;
		g.font = `bold 64px ${FONT}`;
		const w = g.measureText(e.label).width + 80;
		const [cx, cy] = [W / 2, s.band * 0.45];
		g.globalAlpha = alpha;
		g.fillStyle = "rgba(30, 32, 38, 0.92)";
		g.strokeStyle = ACCENT;
		g.lineWidth = 4;
		g.beginPath();
		g.roundRect(cx - w / 2, cy - 70, w, 140, 28);
		g.fill();
		g.stroke();
		g.fillStyle = TEXT;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.fillText(e.label, cx, cy);
		g.globalAlpha = 1;
	}
}

function drawRings(s: Stage, t: number): void {
	const { g } = s;
	for (const e of s.events.filter((x): x is Of<"ring"> => x.kind === "ring")) {
		const alpha = fade(t, e.t, e.t + 2600);
		if (!alpha) continue;
		const [x, y, w, h] = e.rect.map(v => v * s.scale);
		g.globalAlpha = alpha;
		g.strokeStyle = ACCENT;
		g.lineWidth = 6;
		g.beginPath();
		g.roundRect(x - 8, y - 8, w + 16, h + 16, 16);
		g.stroke();
		if (e.label) {
			g.font = `bold 34px ${FONT}`;
			const lw = g.measureText(e.label).width + 40;
			const ly = Math.min(y + h + 20, s.band - 70);
			const lx = Math.max(10, Math.min(x, W - lw - 10));
			g.fillStyle = ACCENT;
			g.beginPath();
			g.roundRect(lx, ly, lw, 56, 28);
			g.fill();
			g.fillStyle = "#ffffff";
			g.textAlign = "left";
			g.textBaseline = "middle";
			g.fillText(e.label, lx + 20, ly + 28);
		}
		g.globalAlpha = 1;
	}
}

/** The arrow pointer at its latest position, and click ripples. */
function drawPointer(s: Stage, t: number): void {
	const { g } = s;
	for (const e of s.events.filter((x): x is Of<"click"> => x.kind === "click")) {
		const dt = t - e.t;
		if (dt < 0 || dt > 450) continue;
		g.globalAlpha = 1 - dt / 450;
		g.strokeStyle = ACCENT;
		g.lineWidth = 6;
		g.beginPath();
		g.arc(e.x * s.scale, e.y * s.scale, 14 + (40 * dt) / 450, 0, Math.PI * 2);
		g.stroke();
		g.globalAlpha = 1;
	}
	const last = s.events.filter(e => (e.kind === "pointer" || e.kind === "pointer-off") && e.t <= t).at(-1);
	if (!last || last.kind !== "pointer") return;
	const [x, y, k] = [last.x * s.scale, last.y * s.scale, 2.2];
	const pts: [number, number][] = [
		[0, 0],
		[0, 21],
		[5, 16],
		[9, 25],
		[12, 24],
		[8, 15],
		[15, 15],
	];
	g.beginPath();
	pts.forEach(([px, py], i) => (i === 0 ? g.moveTo(x + px * k, y + py * k) : g.lineTo(x + px * k, y + py * k)));
	g.closePath();
	g.fillStyle = "#000000";
	g.fill();
	g.strokeStyle = "#ffffff";
	g.lineWidth = 3;
	g.stroke();
}

/** The playback speed at `t`: the latest speed event's factor, 1 before any. */
function speedAt(s: Stage, t: number): number {
	let factor = 1;
	for (const e of s.events) if (e.kind === "speed" && e.t <= t) factor = e.factor;
	return factor;
}

/** A badge in the band's corner while the video plays faster than life. */
function drawSpeed(s: Stage, t: number): void {
	const factor = speedAt(s, t);
	if (factor <= 1) return;
	const { g } = s;
	const label = `${factor}× speed`;
	g.font = `bold 32px ${FONT}`;
	const w = g.measureText(label).width + 40;
	g.fillStyle = "rgba(255, 255, 255, 0.1)";
	g.beginPath();
	g.roundRect(W - w - 24, s.band + 22, w, 54, 27);
	g.fill();
	g.fillStyle = QUIET;
	g.textAlign = "center";
	g.textBaseline = "middle";
	g.fillText(label, W - 24 - w / 2, s.band + 49);
}

/** The stage for `rec`, with the backdrop: the window's own background (its top-left pixel). */
async function setStage(rec: Recording, width: number): Promise<{ stage: Stage; shrink: number; backdrop: string }> {
	const end = rec.events.find(e => e.kind === "end")?.t ?? rec.frames.at(-1)?.t ?? 0;
	const first = await loadImage(rec.frames[0]?.path ?? "");
	const shrink = W / first.width;
	const g = createCanvas(W, H).getContext("2d");
	g.drawImage(first, 0, 0, 1, 1, 0, 0, 1, 1);
	const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
	const stage: Stage = {
		g,
		scale: W / width,
		band: Math.min(first.height * shrink, MAX_APP),
		events: rec.events,
		end,
	};
	return { stage, shrink, backdrop: `rgb(${r}, ${gr}, ${b})` };
}

/** Every output frame, drawn and handed to `write` as RGBA bytes; `width` is the window's logical width. */
async function render(rec: Recording, width: number, write: (rgba: Uint8Array) => Promise<void>): Promise<void> {
	const { stage, shrink, backdrop } = await setStage(rec, width);
	const { g } = stage;
	let at = 0;
	let shown = -1;
	let image: Image | undefined;
	// `t` is the recording's time; a speed event makes it run faster than the video's.
	for (let t = 0; t <= stage.end; t += (1000 / FPS) * speedAt(stage, t)) {
		while ((rec.frames[at + 1]?.t ?? Infinity) <= t) at++;
		if (at !== shown) [shown, image] = [at, await loadImage(rec.frames[at]?.path ?? "")];
		g.fillStyle = backdrop;
		g.fillRect(0, 0, W, H);
		if (image) g.drawImage(image, 0, 0, image.width, stage.band / shrink, 0, 0, W, stage.band);
		g.fillStyle = "rgba(255, 255, 255, 0.09)";
		g.fillRect(0, stage.band, W, 2);
		for (const draw of [drawRings, drawPointer, drawCaptions, drawKeys, drawSpeed]) draw(stage, t);
		await write(new Uint8Array(g.getImageData(0, 0, W, H).data.buffer));
	}
}

/** The MP4: H.264 that every player and site takes, no sound. */
const MP4 = "-c:v libx264 -profile:v high -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart".split(" ");
/** The README preview: half size, 12 frames a second, looping. */
const WEBP = "-vf fps=12,scale=540:-2:flags=lanczos -an -c:v libwebp_anim -loop 0 -q:v 65 -compression_level 6".split(
	" ",
);

async function ffmpeg(args: string[], stdin?: (sink: FileSink) => Promise<void>): Promise<void> {
	const proc = Bun.spawn(["ffmpeg", "-v", "error", "-y", ...args], {
		stdin: stdin ? "pipe" : "ignore",
		stdout: "ignore",
		stderr: "inherit",
	});
	if (stdin && proc.stdin) {
		await stdin(proc.stdin);
		await proc.stdin.end();
	}
	if ((await proc.exited) !== 0) throw new Error(`ffmpeg failed to write ${args.at(-1)}`);
}

/** Writes `out.mp4` and, from it, the README preview `out.webp`; `width` is the window's logical width. */
export async function compose(rec: Recording, width: number, out: { mp4: string; webp: string }): Promise<void> {
	const raw = ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-"];
	await ffmpeg([...raw, ...MP4, out.mp4], async sink => {
		// Flushing each frame keeps memory flat: ffmpeg encodes slower than frames are drawn.
		await render(rec, width, async rgba => {
			await sink.write(rgba);
			await sink.flush();
		});
	});
	await ffmpeg(["-i", out.mp4, ...WEBP, out.webp]);
}
