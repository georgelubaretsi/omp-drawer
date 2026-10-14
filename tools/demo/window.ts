// The demo's Tern window: Tern started with a control endpoint on the sandbox's profile, driven
// and photographed with `tern ctl` (Tern's developer tooling: `tern help dev`). The window must be
// signed in (Tern's closed beta) and keep the size the demo asks for: a tiling window manager
// that resizes it needs DEMO_WINDOW_SETUP, a shell command that floats the window; it runs once
// the window is open, with DEMO_WINDOW_PID set to the window's process.
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { type Sandbox, ternBinary } from "./sandbox";

const HIDE_PEERS = join(import.meta.dir, "demo.css");

export class TernWindow {
	readonly #s: Sandbox;
	readonly #tern: string;
	readonly #proc: Subprocess;

	private constructor(s: Sandbox, tern: string, proc: Subprocess) {
		this.#s = s;
		this.#tern = tern;
		this.#proc = proc;
	}

	/** The environment Tern and `tern ctl` share: the sandbox's profile, daemon and logs. */
	static env(s: Sandbox): Record<string, string | undefined> {
		return {
			...process.env,
			SHELL: s.shell,
			TERN_CONFIG_DIR: s.tern,
			TERN_DAEMON_SOCKET: s.daemonSocket,
			STENCIL_LOG_DIR: s.logs,
			TMPDIR: s.tmp,
		};
	}

	/** Opens the window at `width` × `height` (logical pixels), dark, with the first tab in the project. */
	static async open(s: Sandbox, width: number, height: number): Promise<TernWindow> {
		const tern = ternBinary();
		// The window's own folder takes `tern ctl shot`'s files, away from the project.
		const proc = Bun.spawn([tern, "--control", s.controlSocket, s.project], {
			cwd: s.root,
			env: TernWindow.env(s),
			stdout: "ignore",
			stderr: "ignore",
			stdin: "ignore",
		});
		const w = new TernWindow(s, tern, proc);
		try {
			await w.#prepare(width, height);
		} catch (error) {
			await w.close();
			throw error;
		}
		return w;
	}

	/** Waits for the window and the sign-in, floats it (DEMO_WINDOW_SETUP), sizes and styles it. */
	async #prepare(width: number, height: number): Promise<void> {
		for (let i = 0; i < 200 && !existsSync(this.#s.controlSocket); i++) await Bun.sleep(100);
		if (!(await this.#signedIn())) throw new Error("Tern isn't signed in: sign in to Tern once, then record again");
		const setup = process.env.DEMO_WINDOW_SETUP;
		if (setup) {
			const env = { ...process.env, DEMO_WINDOW_PID: String(this.#proc.pid) };
			const code = await Bun.spawn(["/bin/sh", "-c", setup], { env, stdout: "inherit", stderr: "inherit" }).exited;
			if (code !== 0) throw new Error(`DEMO_WINDOW_SETUP exited ${code}`);
		}
		await this.size(width, height);
		await this.ctl("css", "demo", HIDE_PEERS);
	}

	/** Whether Tern's sign-in gate opens; it checks the keychain after the window starts. */
	async #signedIn(): Promise<boolean> {
		for (let i = 0; i < 60; i++) {
			const state = await this.ctl("state").catch(() => undefined);
			const gate: unknown = state && typeof state === "object" ? Reflect.get(state, "gate") : undefined;
			if (gate && typeof gate === "object" && Reflect.get(gate, "signed_in") === true) return true;
			await Bun.sleep(250);
		}
		return false;
	}

	/** Resizes the window and checks that the size holds. */
	async size(width: number, height: number): Promise<void> {
		await this.ctl("resize", width, height);
		await Bun.sleep(800);
		const stats = await this.ctl("stats");
		const viewport: unknown = stats && typeof stats === "object" ? Reflect.get(stats, "viewport") : undefined;
		if (!Array.isArray(viewport) || viewport[0] !== width || viewport[1] !== height)
			throw new Error(
				`the demo window is ${JSON.stringify(viewport)}, not ${width}×${height}: a window manager resized it; set DEMO_WINDOW_SETUP to a command that floats the focused window`,
			);
	}

	/** Runs one `tern ctl` command; its JSON answer, or its text. */
	ctl(...args: (string | number)[]): Promise<unknown> {
		return this.cli("ctl", "--control", this.#s.controlSocket, ...args);
	}

	/** Runs `tern` on the sandbox's profile and daemon (`tern ls --json`, `tern focus 5`); JSON or text. */
	async cli(...args: (string | number)[]): Promise<unknown> {
		const proc = Bun.spawn([this.#tern, ...args.map(String)], {
			env: TernWindow.env(this.#s),
			stdout: "pipe",
			stderr: "pipe",
			stdin: "ignore",
		});
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		try {
			const parsed: unknown = JSON.parse(out);
			return parsed;
		} catch {
			if (code !== 0) throw new Error(`tern ${args.join(" ")} failed: ${(err || out).trim()}`);
			return out;
		}
	}

	/** Photographs the window; the PNG's path. The layout file beside it (200 kB a shot) is dropped. */
	async shot(name: string): Promise<string | undefined> {
		const r = await this.ctl("shot", name);
		const png: unknown = r && typeof r === "object" ? Reflect.get(r, "png") : undefined;
		if (typeof png !== "string") return undefined;
		const path = join(this.#s.root, png);
		await rm(path.replace(/\.png$/, ".layout.json"), { force: true });
		return path;
	}

	/** Every `title` and `text` in the window's element tree, joined: what the window shows. */
	async text(): Promise<string> {
		return JSON.stringify(await this.ctl("tree"));
	}

	/**
	 * Closes the window, then stops what outlives it and names a sandbox path: the session daemon,
	 * and plugin helpers (the bridge's wake reader blocks on its FIFO for good). A second sweep
	 * catches a daemon a `tern` command started while the first ran.
	 */
	async close(): Promise<void> {
		await this.ctl("quit").catch(() => undefined);
		await Promise.race([this.#proc.exited, Bun.sleep(5000)]);
		this.#proc.kill();
		for (const pause of [0, 1000]) {
			await Bun.sleep(pause);
			const left = Bun.spawnSync(["pgrep", "-f", `${this.#s.root}/`]).stdout.toString();
			for (const pid of left.split("\n").filter(Boolean)) {
				try {
					process.kill(Number(pid));
				} catch {
					// It exited between pgrep and now.
				}
			}
		}
	}
}
