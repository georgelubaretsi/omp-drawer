// A throwaway macOS virtual machine for the desktop demos, with tart: cloned from a base image
// (copy-on-write, so it costs no disk space until it changes), started without a window and with
// its VNC server, reached over SSH with the image's user and password. Deleted when done.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GuestOptions {
	/** The image to clone, as `tart list` names it. */
	base: string;
	/** The clone's name; one left from an earlier run is deleted first. */
	name: string;
	tart?: string;
	user?: string;
	password?: string;
}

/** Runs a command and returns its output; throws with what it said when it fails. */
function run(argv: string[], env?: Record<string, string | undefined>): string {
	const r = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe", env });
	if (r.exitCode !== 0) throw new Error(`${argv.slice(0, 3).join(" ")} failed: ${r.stderr.toString().trim()}`);
	return r.stdout.toString();
}

/** The first line of the stream matching `pattern`, within `timeoutMs`. */
async function lineMatching(stream: ReadableStream<Uint8Array>, pattern: RegExp, timeoutMs: number): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let seen = "";
	const end = Date.now() + timeoutMs;
	while (Date.now() < end) {
		const chunk = await Promise.race([reader.read(), Bun.sleep(1000).then(() => undefined)]);
		if (chunk?.done) break;
		if (chunk?.value) seen += decoder.decode(chunk.value);
		const match = pattern.exec(seen);
		if (match) {
			reader.releaseLock();
			return match[0];
		}
	}
	throw new Error(`tart printed no ${pattern} in ${timeoutMs / 1000} s:\n${seen}`);
}

export class Guest {
	readonly vncUrl: string;
	readonly ip: string;
	readonly #o: Required<GuestOptions>;
	readonly #process: ReturnType<typeof Bun.spawn>;
	readonly #work: string;

	private constructor(p: {
		o: Required<GuestOptions>;
		vm: ReturnType<typeof Bun.spawn>;
		vncUrl: string;
		ip: string;
		work: string;
	}) {
		this.#o = p.o;
		this.#process = p.vm;
		this.vncUrl = p.vncUrl;
		this.ip = p.ip;
		this.#work = p.work;
	}

	static async start(options: GuestOptions): Promise<Guest> {
		const o = { tart: process.env.TART ?? "tart", user: "admin", password: "admin", ...options };
		Bun.spawnSync([o.tart, "stop", o.name]);
		Bun.spawnSync([o.tart, "delete", o.name]);
		run([o.tart, "clone", o.base, o.name]);
		const vm = Bun.spawn([o.tart, "run", o.name, "--no-graphics", "--vnc-experimental"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const vncUrl = await lineMatching(vm.stdout, /vnc:\/\/:\S+@[\d.]+:\d+/, 120_000);
		let ip = "";
		for (let i = 0; i < 60 && !ip; i++) {
			ip = Bun.spawnSync([o.tart, "ip", o.name]).stdout.toString().trim();
			if (!ip) await Bun.sleep(2000);
		}
		const work = mkdtempSync(join(tmpdir(), "piebird-vm-"));
		const guest = new Guest({ o, vm, vncUrl, ip, work });
		for (let i = 0; i < 60; i++) {
			if (guest.#ssh(["true"]).exitCode === 0) return guest;
			await Bun.sleep(2000);
		}
		await guest.stop();
		throw new Error(`${o.name} came up without SSH`);
	}

	/** SSH and scp, signed in with the image's password (an askpass program answers for it). */
	#env(): Record<string, string | undefined> {
		const askpass = join(this.#work, "askpass");
		writeFileSync(askpass, '#!/bin/sh\nprintf "%s\\n" "$PIEBIRD_VM_PASSWORD"\n');
		chmodSync(askpass, 0o700);
		return {
			...process.env,
			SSH_ASKPASS: askpass,
			SSH_ASKPASS_REQUIRE: "force",
			PIEBIRD_VM_PASSWORD: this.#o.password,
		};
	}

	static readonly #options = [
		"-o",
		"StrictHostKeyChecking=no",
		"-o",
		"UserKnownHostsFile=/dev/null",
		"-o",
		"LogLevel=ERROR",
		"-o",
		"PubkeyAuthentication=no",
	];

	#ssh(command: string[]): ReturnType<typeof Bun.spawnSync> {
		return Bun.spawnSync(["ssh", ...Guest.#options, `${this.#o.user}@${this.ip}`, "--", ...command], {
			stdout: "pipe",
			stderr: "pipe",
			env: this.#env(),
		});
	}

	/** Runs a shell command in the guest, as its user; its output. */
	async shell(command: string): Promise<string> {
		const child = Bun.spawn(["ssh", ...Guest.#options, `${this.#o.user}@${this.ip}`, "--", command], {
			stdout: "pipe",
			stderr: "pipe",
			env: this.#env(),
		});
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (code !== 0) throw new Error(`in the guest, ${command} failed: ${err.trim()}`);
		return out;
	}

	/** Runs a shell command in the guest as root (the image's user may sudo with its password). */
	sudo(command: string): Promise<string> {
		return this.shell(`printf '%s\\n' '${this.#o.password}' | sudo -S -p '' sh -c ${JSON.stringify(command)}`);
	}

	/** Copies a file from here into the guest. */
	copy(local: string, remote: string): void {
		run(["scp", ...Guest.#options, local, `${this.#o.user}@${this.ip}:${remote}`], this.#env());
	}

	async stop(keep = false): Promise<void> {
		Bun.spawnSync([this.#o.tart, "stop", this.#o.name]);
		await this.#process.exited;
		if (!keep) Bun.spawnSync([this.#o.tart, "delete", this.#o.name]);
		rmSync(this.#work, { recursive: true, force: true });
	}
}
