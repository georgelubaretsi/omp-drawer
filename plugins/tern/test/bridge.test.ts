// The bridge protocol is files plus named pipes polled on short intervals, so these
// tests run it against the real filesystem with millisecond-scale limits; fake timers
// cannot drive pipe readers or the fake window's polling.
import { afterEach, describe, expect, test } from "bun:test";
import { closeSync, constants, openSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { call, type CallOptions, isRemotePane, MAX_REQUEST_BYTES } from "../src/bridge";

/** `vanish`: stopped mid-claim, after taking the request but before recording its token. */
type Behaviour = "answer" | "hang" | "die" | "vanish";

/** A stand-in for one Tern window running tern-plugin/window.luau. */
class FakeWindow {
	runs = 0;
	#timer: Timer | undefined;
	#reader: number | undefined;
	readonly token = `w${Math.random().toString(36).slice(2, 8)}`;

	constructor(
		readonly dir: string,
		readonly holds: (pane: number) => boolean,
		readonly behaviour: Behaviour = "answer",
	) {}

	/** Creates the wake pipe and keeps it open for reading, as the window's `cat` does. */
	start(): void {
		if (Bun.spawnSync(["mkfifo", this.#pipe]).exitCode !== 0) throw new Error("mkfifo failed");
		this.#reader = openSync(this.#pipe, constants.O_RDONLY | constants.O_NONBLOCK);
		this.#timer = setInterval(() => void this.#tick(), 5);
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#stopListening();
	}

	/** Stops listening for `ms`, as a woken window does until its next `cat` starts. */
	pause(ms: number): void {
		this.#stopListening();
		setTimeout(() => {
			this.#reader = openSync(this.#pipe, constants.O_RDONLY | constants.O_NONBLOCK);
		}, ms);
	}

	get #pipe(): string {
		return join(this.dir, `wake-${this.token}.fifo`);
	}

	#stopListening(): void {
		if (this.#reader !== undefined) closeSync(this.#reader);
		this.#reader = undefined;
	}

	async #tick(): Promise<void> {
		if (this.#reader === undefined) return;
		for (const name of await readdir(join(this.dir, "req"))) {
			const req = await this.#runnable(name);
			if (!req) continue;
			const res = join(this.dir, "res", req.id);
			try {
				await rename(req.path, `${res}.taken`);
			} catch {
				continue; // another window took it, or omp withdrew it
			}
			this.runs += 1;
			if (this.behaviour !== "vanish") await writeFile(`${res}.claimed`, this.token);
			if (this.behaviour === "die") this.#stopListening();
			if (this.behaviour !== "answer") continue;
			await writeFile(`${res}.json`, JSON.stringify({ ok: true, result: `ran ${req.code}` }));
			await writeFile(`${res}.done`, "");
		}
	}

	/** The request in req/<name> when this window may run it. */
	async #runnable(name: string): Promise<{ id: string; path: string; code: string } | undefined> {
		const match = /^((\d+)-(\d+)-[\w-]+)\.json$/.exec(name);
		if (!match || Number(match[2]) <= Math.floor(Date.now() / 1000) || !this.holds(Number(match[3])))
			return undefined;
		const path = join(this.dir, "req", name);
		const req: unknown = JSON.parse(await readFile(path, "utf8").catch(() => "null"));
		if (!isRequest(req) || (req.window !== undefined && req.window !== this.token)) return undefined;
		return { id: match[1], path, code: req.code };
	}
}

function isRequest(value: unknown): value is { code: string; window?: unknown } {
	return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
}

const windows: FakeWindow[] = [];
const dirs: string[] = [];

afterEach(async () => {
	for (const w of windows.splice(0)) w.stop();
	for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function bridgeFolder(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "omp-bridge-test-"));
	dirs.push(dir);
	await mkdir(join(dir, "req"));
	await mkdir(join(dir, "res"));
	return dir;
}

function window(dir: string, holds: (pane: number) => boolean, behaviour?: Behaviour): FakeWindow {
	const w = new FakeWindow(dir, holds, behaviour);
	windows.push(w);
	return w;
}

function options(dir: string, extra: Partial<CallOptions> = {}): CallOptions & { reloads: () => number } {
	let reloads = 0;
	return {
		dir,
		pane: 7,
		code: "return 1",
		timeoutMs: 2000,
		claimMs: 150,
		wakeMs: 20,
		checkMs: 20,
		pollMs: 5,
		reload: async () => {
			reloads += 1;
		},
		...extra,
		reloads: () => reloads,
	};
}

describe("tern_lua bridge: routing to windows", () => {
	test("returns the window's answer and leaves no exchange files", async () => {
		const dir = await bridgeFolder();
		const w = window(dir, pane => pane === 7);
		w.start();
		const o = options(dir);
		expect(await call(o)).toEqual({
			kind: "answer",
			ok: true,
			result: "ran return 1",
			printed: undefined,
			note: undefined,
			window: w.token,
		});
		expect(await readdir(join(dir, "req"))).toEqual([]);
		expect(await readdir(join(dir, "res"))).toEqual([]);
		expect(o.reloads()).toBe(0);
	});

	test("keeps a caller on the window that answered it when several windows show its pane", async () => {
		const dir = await bridgeFolder();
		const pair = [window(dir, () => true), window(dir, () => true)];
		for (const w of pair) w.start();
		const first = await call(options(dir));
		if (first.kind !== "answer") throw new Error(first.kind);
		for (let i = 0; i < 5; i++)
			expect(await call(options(dir, { window: first.window }))).toMatchObject({ window: first.window });
		expect(pair.map(w => w.runs).toSorted((a, b) => a - b)).toEqual([0, 6]);
	});

	test("moves a pinned caller to another window, without a reload, once its window stops listening", async () => {
		const dir = await bridgeFolder();
		const [gone, other] = [window(dir, () => true), window(dir, () => true)];
		gone.start();
		other.start();
		gone.stop();
		const o = options(dir, { window: gone.token });
		expect(await call(o)).toMatchObject({ kind: "answer", window: other.token });
		expect(o.reloads()).toBe(0);
	});

	test("keeps a pinned request for its window while that window briefly stops listening", async () => {
		const dir = await bridgeFolder();
		const [pinned, other] = [window(dir, () => true), window(dir, () => true)];
		pinned.start();
		other.start();
		pinned.pause(10);
		expect(await call(options(dir, { window: pinned.token, wakeMs: 50 }))).toMatchObject({
			kind: "answer",
			window: pinned.token,
		});
		expect(other.runs).toBe(0);
	});

	test("withdraws an unclaimed request, reloads once and sends it again", async () => {
		const dir = await bridgeFolder();
		const w = window(dir, () => true);
		const o = options(dir, {
			reload: async () => {
				w.start(); // the reload brings the bridge back
			},
		});
		expect(await call(o)).toMatchObject({ kind: "answer", ok: true });
		expect(w.runs).toBe(1);
		expect(await readdir(join(dir, "req"))).toEqual([]);
	});
});

describe("tern_lua bridge: at most once", () => {
	test("reports a claimed request whose window stopped listening as indeterminate, reloads, and never resends it", async () => {
		const dir = await bridgeFolder();
		const w = window(dir, () => true, "die");
		w.start();
		const o = options(dir);
		const outcome = await call(o);
		expect(outcome.kind).toBe("indeterminate");
		expect(outcome.kind === "indeterminate" && outcome.reason).toContain("stopped listening");
		expect(outcome.kind === "indeterminate" && outcome.reloaded).toBe(true);
		expect(o.reloads()).toBe(1);
		expect(w.runs).toBe(1);
		expect(await readdir(join(dir, "req"))).toEqual([]);
	});

	test("treats a request taken without a claim token as a stopped window, without waiting for the timeout", async () => {
		const dir = await bridgeFolder();
		const w = window(dir, () => true, "vanish");
		w.start();
		const o = options(dir, { timeoutMs: 10_000 });
		const started = Date.now();
		const outcome = await call(o);
		expect(outcome).toMatchObject({ kind: "indeterminate", reloaded: true });
		expect(Date.now() - started).toBeLessThan(2000);
		expect(o.reloads()).toBe(1);
		expect(w.runs).toBe(1);
	});

	test("times out a claimed request whose window keeps listening as indeterminate", async () => {
		const dir = await bridgeFolder();
		const w = window(dir, () => true, "hang");
		w.start();
		const o = options(dir, { timeoutMs: 400 });
		const outcome = await call(o);
		expect(outcome.kind).toBe("indeterminate");
		expect(outcome.kind === "indeterminate" && outcome.reason).toContain("no answer within");
		expect(outcome.kind === "indeterminate" && outcome.reloaded).toBe(false);
		expect(o.reloads()).toBe(0);
		expect(w.runs).toBe(1);
	});

	test("never runs a request in a window that doesn't hold the caller's pane, and gives up after one reload", async () => {
		const dir = await bridgeFolder();
		const w = window(dir, pane => pane === 99);
		w.start();
		const o = options(dir);
		expect(await call(o)).toEqual({ kind: "unclaimed" });
		expect(o.reloads()).toBe(1);
		expect(w.runs).toBe(0);
		expect(await readdir(join(dir, "req"))).toEqual([]);
	});

	test("cancels a request no window has taken", async () => {
		const dir = await bridgeFolder();
		const controller = new AbortController();
		controller.abort();
		const o = options(dir, { signal: controller.signal });
		expect(await call(o)).toEqual({ kind: "cancelled" });
		expect(o.reloads()).toBe(0);
		expect(await readdir(join(dir, "req"))).toEqual([]);
	});

	test("reports not_loaded when the plugin's folder never appears", async () => {
		const dir = await mkdtemp(join(tmpdir(), "omp-bridge-test-"));
		dirs.push(dir);
		const o = options(dir);
		expect(await call(o)).toEqual({ kind: "not_loaded" });
		expect(o.reloads()).toBe(1);
	});

	test("never runs a request omp withdrew, even when a window takes it at the same moment", async () => {
		const dir = await bridgeFolder();
		// Two windows taking requests as fast as they can, while omp withdraws each one at once.
		let runs = 0;
		const stop = new AbortController();
		const take = async () => {
			while (!stop.signal.aborted) {
				for (const name of await readdir(join(dir, "req"))) {
					const match = /^([\w-]+)\.json$/.exec(name);
					if (!match) continue;
					const res = join(dir, "res", match[1]);
					try {
						await rename(join(dir, "req", name), `${res}.taken`);
					} catch {
						continue;
					}
					runs += 1;
					await writeFile(`${res}.claimed`, "taker");
					await writeFile(`${res}.json`, JSON.stringify({ ok: true }));
					await writeFile(`${res}.done`, "");
				}
				await Bun.sleep(0);
			}
		};
		const takers = [take(), take()];
		let answers = 0;
		for (let i = 0; i < 100; i++) {
			if ((await call(options(dir, { claimMs: 0, wakeMs: 1, pollMs: 0 }))).kind === "answer") answers += 1;
		}
		stop.abort();
		await Promise.all(takers);
		expect(runs).toBe(answers);
	});

	test("never runs a request a dead omp left behind, and removes it once expired", async () => {
		const dir = await bridgeFolder();
		const orphan = join(dir, "req", `${Math.floor(Date.now() / 1000) - 60}-7-orphan.json`);
		await writeFile(orphan, JSON.stringify({ code: "return 'stale'" }));
		const w = window(dir, pane => pane === 7);
		w.start();
		expect(await call(options(dir))).toMatchObject({ kind: "answer", result: "ran return 1" });
		expect(w.runs).toBe(1);
		expect(await readdir(join(dir, "req"))).toEqual([]);
	});

	test("refuses code whose JSON encoding exceeds the window's read limit, without sending or reloading", async () => {
		const dir = await bridgeFolder();
		// Under the limit as source, over it once every quote is escaped.
		const code = `return "${'"'.repeat(MAX_REQUEST_BYTES / 2)}"`;
		const o = options(dir, { code });
		const outcome = await call(o);
		expect(outcome.kind).toBe("too_large");
		expect(await readdir(join(dir, "req"))).toEqual([]);
		expect(o.reloads()).toBe(0);
	});
});

describe("isRemotePane", () => {
	test("treats a local identity chain, or none, as local", () => {
		expect(isRemotePane('{"hops":[{"principal":"me","method":"local","from":"","host":"mac","user":"me"}]}')).toBe(
			false,
		);
		expect(isRemotePane(undefined)).toBe(false);
		expect(isRemotePane("not json")).toBe(false);
	});

	test("treats a chain with a non-local hop as remote", () => {
		expect(
			isRemotePane('{"hops":[{"principal":"me","method":"ssh-key","from":"laptop","host":"devbox","user":"me"}]}'),
		).toBe(true);
	});
});
