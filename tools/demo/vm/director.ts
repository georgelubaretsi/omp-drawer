// What a desktop demo scenario does in the virtual machine, and the record it leaves for
// compose.ts: the screen photographed 10 times a second, and timed captions, clicks and playback
// speed. Places are in the screen's points (half its pixels on a Retina display).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import type { DemoEvent, Frame, Recording } from "../director";
import type { Guest } from "./guest";
import type { Vnc } from "./vnc";

const SCALE = 2;
const FRAME_MS = 100;

export class VmDemo {
	readonly guest: Guest;
	readonly #vnc: Vnc;
	readonly #dir: string;
	readonly #events: DemoEvent[] = [];
	readonly #frames: Frame[] = [];
	#start = 0;
	#capturing = false;
	#loop: Promise<void> | undefined;
	#at: [number, number] = [0, 0];

	constructor(vnc: Vnc, guest: Guest, dir: string) {
		this.#vnc = vnc;
		this.guest = guest;
		this.#dir = dir;
		mkdirSync(dir, { recursive: true });
	}

	#now(): number {
		return performance.now() - this.#start;
	}

	start(): void {
		this.#start = performance.now();
		this.#capturing = true;
		this.#loop = this.#capture();
	}

	/** The screen as an image file's bytes. */
	#encode(format: "jpeg" | "png"): Promise<Buffer> {
		const canvas = createCanvas(this.#vnc.width, this.#vnc.height);
		const g = canvas.getContext("2d");
		const image = g.createImageData(canvas.width, canvas.height);
		image.data.set(this.#vnc.rgba());
		g.putImageData(image, 0, 0);
		return format === "png" ? canvas.encode("png") : canvas.encode("jpeg", 85);
	}

	/** Photographs the screen until `stop`; one of another size (the screen redrawing) is skipped, as the video has one size. */
	async #capture(): Promise<void> {
		const size = [this.#vnc.width, this.#vnc.height];
		let i = 0;
		while (this.#capturing) {
			const t = this.#now();
			if (this.#vnc.width === size[0] && this.#vnc.height === size[1]) {
				const path = join(this.#dir, `f${String(i++).padStart(5, "0")}.jpg`);
				await Bun.write(path, await this.#encode("jpeg"));
				this.#frames.push({ t, path });
			}
			await Bun.sleep(Math.max(0, t + FRAME_MS - this.#now()));
		}
	}

	/** With DEMO_SHOTS set to a folder, saves the screen there as `<name>.png`, for finding places. */
	async shot(name: string): Promise<void> {
		const dir = process.env.DEMO_SHOTS;
		if (!dir) return;
		mkdirSync(dir, { recursive: true });
		await Bun.write(join(dir, `${name}.png`), await this.#encode("png"));
	}

	async stop(): Promise<Recording> {
		this.#events.push({ t: this.#now(), kind: "end" });
		this.#capturing = false;
		await this.#loop;
		return { frames: this.#frames, events: this.#events, prompts: [] };
	}

	/** A caption under the screen until the next one; `sub` is a quieter second line. */
	caption(text: string, sub?: string): void {
		this.#events.push({ t: this.#now(), kind: "caption", text, ...(sub ? { sub } : {}) });
	}

	/** Plays what follows `factor` times faster, until the next call. */
	speed(factor: number): void {
		this.#events.push({ t: this.#now(), kind: "speed", factor });
	}

	/** Moves the pointer there over `ms`, as a hand would. */
	async glide(x: number, y: number, ms = 600): Promise<void> {
		const [fx, fy] = this.#at;
		const steps = Math.max(1, Math.round(ms / 30));
		for (let i = 1; i <= steps; i++) {
			this.#vnc.pointer((fx + ((x - fx) * i) / steps) * SCALE, (fy + ((y - fy) * i) / steps) * SCALE);
			await Bun.sleep(ms / steps);
		}
		this.#at = [x, y];
	}

	async click(x: number, y: number, times = 1): Promise<void> {
		await this.glide(x, y);
		await Bun.sleep(150);
		this.#events.push({ t: this.#now(), kind: "click", x, y });
		for (let i = 0; i < times; i++) {
			this.#vnc.pointer(x * SCALE, y * SCALE, 1);
			await Bun.sleep(60);
			this.#vnc.pointer(x * SCALE, y * SCALE, 0);
			await Bun.sleep(60);
		}
	}

	async doubleClick(x: number, y: number): Promise<void> {
		await this.click(x, y, 2);
	}

	async wait(ms: number): Promise<void> {
		await Bun.sleep(ms);
	}

	/** Waits for the screen to change, then to hold still, played fast meanwhile. */
	async settle(timeoutMs = 60_000): Promise<void> {
		this.speed(4);
		await Promise.race([this.#vnc.nextUpdate(), Bun.sleep(timeoutMs)]);
		await this.#vnc.settle(1200, timeoutMs);
		this.speed(1);
	}

	/** Waits until the point (x, y) shows `rgb`, give or take a little, played fast meanwhile. */
	async waitForColor(x: number, y: number, rgb: [number, number, number], timeoutMs = 60_000): Promise<void> {
		const near = () => this.#vnc.pixel(x * SCALE, y * SCALE).every((c, i) => Math.abs(c - (rgb[i] ?? 0)) <= 12);
		const end = performance.now() + timeoutMs;
		this.speed(4);
		while (!near()) {
			if (performance.now() > end) {
				const seen = this.#vnc.pixel(x * SCALE, y * SCALE).join(", ");
				throw new Error(`(${x}, ${y}) never showed rgb(${rgb.join(", ")}); it shows rgb(${seen})`);
			}
			await Promise.race([this.#vnc.nextUpdate(), Bun.sleep(1000)]);
		}
		this.speed(1);
	}
}
