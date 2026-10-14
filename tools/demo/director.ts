// What a demo scenario does and the record it leaves: the window photographed up to 30 times a
// second, timed events (captions, keys pressed, highlights, the pointer, playback speed) that
// compose.ts draws over the frames, and what the agents did for each prompt. Times are
// milliseconds since the start.
import type { Agent } from "./agents";
import { journalsOf } from "./harness";
import { type Turn, turnFor } from "./journal";
import { focusedBlock, newestTabBlock, OMP_READY, untilReady } from "./launch";
import type { Sandbox } from "./sandbox";
import type { TernWindow } from "./window";

/** A rectangle in the window's logical pixels: x, y, width, height. */
export type Rect = [number, number, number, number];

export type DemoEvent =
	| { t: number; kind: "caption"; text: string; sub?: string }
	| { t: number; kind: "key"; label: string }
	| { t: number; kind: "ring"; rect: Rect; label?: string }
	| { t: number; kind: "pointer"; x: number; y: number }
	| { t: number; kind: "pointer-off" }
	| { t: number; kind: "click"; x: number; y: number }
	| { t: number; kind: "speed"; factor: number }
	| { t: number; kind: "end" };

export interface Frame {
	t: number;
	path: string;
}

/** A prompt the demo sent, the agent it went to, how long it took, and what it did (journal.ts). */
export interface Prompted extends Turn {
	agent: Agent;
	prompt: string;
	seconds: number;
}

export interface Recording {
	frames: Frame[];
	events: DemoEvent[];
	prompts: Prompted[];
}

/** The person answering a question an agent asks mid-turn (Demo.prompt). */
export interface Answer {
	/** Text the window shows once the question is up. */
	when: string;
	/** The keys pressed, each with the label the video shows. */
	keys: [string, string][];
	/** Text the question shows while it is still open: the keys are pressed again while it shows. */
	open?: string;
	/**
	 * The agent may ask in its reply instead, ending its turn: for captions that fit both. Without
	 * it, a turn that never showed `when` fails the run, since the captions tell of the question.
	 */
	optional?: boolean;
}

export class Demo {
	readonly window: TernWindow;
	readonly sandbox: Sandbox;
	readonly #events: DemoEvent[] = [];
	readonly #frames: Frame[] = [];
	readonly #prompts: Prompted[] = [];
	#start = 0;
	#capturing = false;
	#loop: Promise<void> | undefined;
	/** The agent the demo talks to, and the block it runs in, focused again before each prompt. */
	#agent: Agent = "omp";
	#block: number | undefined;

	constructor(window: TernWindow, sandbox: Sandbox) {
		this.window = window;
		this.sandbox = sandbox;
	}

	#now(): number {
		return performance.now() - this.#start;
	}

	/** Starts photographing the window. */
	start(): void {
		this.#start = performance.now();
		this.#capturing = true;
		this.#loop = this.#capture();
	}

	/** Photographs the window until `stop`; a shot that fails is a frame skipped. */
	async #capture(): Promise<void> {
		let i = 0;
		while (this.#capturing) {
			const t = this.#now();
			const path = await this.window.shot(`f${String(i++).padStart(5, "0")}`).catch(() => undefined);
			if (path) this.#frames.push({ t, path });
			await Bun.sleep(Math.max(0, t + 1000 / 30 - this.#now()));
		}
	}

	/** Plays what follows `factor` times faster in the video (1: real time), with a badge saying so. */
	speed(factor: number): void {
		this.#events.push({ t: this.#now(), kind: "speed", factor });
	}

	/** Stops photographing; the frames and events so far. */
	async stop(): Promise<Recording> {
		this.#events.push({ t: this.#now(), kind: "end" });
		this.#capturing = false;
		await this.#loop;
		return { frames: this.#frames, events: this.#events, prompts: this.#prompts };
	}

	wait(ms: number): Promise<void> {
		return Bun.sleep(ms);
	}

	/** A caption under the window until the next one; `sub` is a quieter second line. */
	caption(text: string, sub?: string): void {
		this.#events.push({ t: this.#now(), kind: "caption", text, sub });
	}

	/** Presses `chord` (Tern's names: Enter, ctrl+c, cmd+alt+t), shown as `label` when given. */
	async key(chord: string, label?: string): Promise<void> {
		if (label) this.#events.push({ t: this.#now(), kind: "key", label });
		await this.window.ctl("key", chord);
	}

	/** Types `text` into the focused pane a word at a time. Double quotes aren't supported: each word is sent quoted. */
	async type(text: string): Promise<void> {
		if (text.includes('"')) throw new Error(`demo text can't hold a double quote: ${text}`);
		for (const word of text.match(/\S+\s*/g) ?? []) {
			await this.window.ctl("type", `"${word}"`);
			await Bun.sleep(45);
		}
	}

	/** Waits until the window shows `text`; throws after `timeoutMs`. */
	async waitFor(text: string, timeoutMs = 30_000): Promise<void> {
		const until = performance.now() + timeoutMs;
		while (performance.now() < until) {
			if ((await this.window.text()).includes(text)) return;
			await Bun.sleep(250);
		}
		throw new Error(`the demo window never showed "${text}"`);
	}

	/**
	 * Waits until omp has shown no "Working" for `quietMs`: a turn it starts by itself, such as
	 * relaying a background job's result, is over. Throws after `timeoutMs`.
	 */
	async idle(quietMs = 3000, timeoutMs = 180_000): Promise<void> {
		const until = performance.now() + timeoutMs;
		let quietSince = performance.now();
		while (performance.now() < until) {
			if ((await this.window.text()).includes("Working")) quietSince = performance.now();
			else if (performance.now() - quietSince >= quietMs) return;
			await Bun.sleep(250);
		}
		throw new Error(`omp was still working after ${timeoutMs / 1000} s`);
	}

	/**
	 * Types `command` (omp, with any flags) in the focused shell and waits for omp's composer, or
	 * until the window shows `ready` (a continued session's composer shows its title instead).
	 */
	async startOmp(command = "omp", ready = OMP_READY): Promise<void> {
		await this.#launch("omp", command);
		await this.waitFor(ready, 60_000);
	}

	/** Starts Claude Code or Codex in the focused shell, on its demo model, and waits for its prompt. */
	async startAgent(agent: "claude" | "codex"): Promise<void> {
		await this.#launch(agent, agent);
		await untilReady(this.window, agent, this.#block);
	}

	async #launch(agent: Agent, command: string): Promise<void> {
		this.#agent = agent;
		this.#block = focusedBlock(await this.window.cli("ls", "--json"));
		await this.type(command);
		await this.key("Enter");
	}

	/** Opens a tab in the project, shows it and waits for its shell; the next start runs there. */
	async newTab(): Promise<void> {
		await this.window.cli("new", "tab", "--cwd", this.sandbox.project);
		const block = newestTabBlock(await this.window.cli("ls", "--json"));
		if (block !== undefined) await this.window.cli("focus", block);
		await Bun.sleep(1500);
	}

	/**
	 * Sends `text` to the agent last started, in its own pane even when an answer moved the focus,
	 * and waits until the answer is done; the wait plays `fast` times faster in the video. `answer`
	 * is the person answering a question the agent asks mid-turn: once the window shows `when`, the
	 * keys are pressed, each shown with its label, and pressed again while the window still shows
	 * `open` (an ask of several questions has a page each, then a review to submit).
	 */
	async prompt(
		text: string,
		{ fast = 3, timeoutMs = 180_000, answer }: { fast?: number; timeoutMs?: number; answer?: Answer } = {},
	): Promise<void> {
		const agent = this.#agent;
		if (this.#block !== undefined) await this.window.cli("focus", this.#block);
		await this.type(text);
		await Bun.sleep(400);
		await this.key("Enter");
		const sent = performance.now();
		await Bun.sleep(1200);
		this.speed(fast);
		const { turn, answered } = await this.#turn(text, { sent, timeoutMs, fast, answer }).finally(() => this.speed(1));
		const seconds = Math.round((performance.now() - sent) / 1000);
		this.#prompts.push({ agent, prompt: text, seconds, ...turn });
		if (turn.end !== "stop") throw new Error(`${agent}'s answer to "${text}" ended with ${turn.end}`);
		if (!answered && !answer?.optional)
			throw new Error(`${agent} answered "${text}" without asking (no "${answer?.when}" showed)`);
		// The window draws the answer's last words a moment after the agent writes them down.
		await Bun.sleep(800);
	}

	/** Waits for the agent's turn answering `text`, answering its question on the way; throws after the timeout. */
	async #turn(
		text: string,
		o: { sent: number; timeoutMs: number; fast: number; answer: Answer | undefined },
	): Promise<{ turn: Turn; answered: boolean }> {
		let answered = o.answer === undefined;
		while (performance.now() < o.sent + o.timeoutMs) {
			if (!answered && o.answer) answered = await this.#answer(o.answer, o.fast);
			const turn = await turnFor(this.#agent, journalsOf(this.sandbox, this.#agent), text);
			if (turn) return { turn, answered };
			await Bun.sleep(500);
		}
		throw new Error(`${this.#agent} didn't finish answering "${text}"`);
	}

	/** Answers `answer`'s question once the window shows it, at full speed; whether it did. */
	async #answer(answer: Answer, fast: number): Promise<boolean> {
		if (!(await this.window.text()).includes(answer.when)) return false;
		this.speed(1);
		await Bun.sleep(2500);
		for (let page = 0; page < 6; page++) {
			for (const [chord, label] of answer.keys) await this.key(chord, label);
			await Bun.sleep(1500);
			if (answer.open === undefined || !(await this.window.text()).includes(answer.open)) break;
		}
		this.speed(fast);
		return true;
	}

	/** The rectangle of the first element `selector` matches, in logical pixels. */
	async rect(selector: string): Promise<Rect | undefined> {
		const tree = await this.window.ctl("tree", selector);
		const nodes: unknown = tree && typeof tree === "object" ? Reflect.get(tree, "nodes") : undefined;
		const first: unknown = Array.isArray(nodes) ? nodes[0] : undefined;
		const rect: unknown = first && typeof first === "object" ? Reflect.get(first, "rect") : undefined;
		return Array.isArray(rect) && rect.length === 4 ? [rect[0], rect[1], rect[2], rect[3]] : undefined;
	}

	/** Rings the element `selector` matches, with an optional label beside it. */
	async ring(selector: string, label?: string): Promise<void> {
		const rect = await this.rect(selector);
		if (rect) this.#events.push({ t: this.#now(), kind: "ring", rect, label });
	}

	/** Moves the drawn pointer (and Tern's) from where it is to (x, y) over `ms`. */
	async glide(from: [number, number], to: [number, number], ms = 700): Promise<void> {
		const steps = Math.max(1, Math.round(ms / 40));
		for (let i = 1; i <= steps; i++) {
			const f = i / steps;
			const e = f * f * (3 - 2 * f);
			const x = from[0] + (to[0] - from[0]) * e;
			const y = from[1] + (to[1] - from[1]) * e;
			this.#events.push({ t: this.#now(), kind: "pointer", x, y });
			await this.window.ctl("move", x.toFixed(1), y.toFixed(1));
		}
	}

	/** Clicks at (x, y), shown as a ripple. */
	async click(x: number, y: number): Promise<void> {
		this.#events.push({ t: this.#now(), kind: "click", x, y });
		await this.window.ctl("click", x.toFixed(1), y.toFixed(1));
	}

	/** Stops drawing the pointer. */
	hidePointer(): void {
		this.#events.push({ t: this.#now(), kind: "pointer-off" });
	}
}
