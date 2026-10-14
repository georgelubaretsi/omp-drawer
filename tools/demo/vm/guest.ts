// A throwaway macOS virtual machine, with tart: cloned from a base image (copy-on-write, so it
// costs no disk space until it changes), started without a window, reached over SSH, deleted when
// done. Folders of this Mac can be shared in, and ports of this Mac's loopback lent to the guest's
// for one command (an SSH reverse tunnel), so a service the host runs, such as omp's model gateway
// (lend.ts), reaches the guest without any credential going in. The desktop demos also start its
// VNC server, to watch and drive its screen (vnc.ts).
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GuestOptions {
	/** The image to clone, as `tart list` names it. */
	base: string;
	/** The clone's name; one left from an earlier run is deleted first. */
	name: string;
	/** Folders of this Mac shared in, as `tart run --dir` takes them (`name:path`). */
	dirs?: readonly string[];
	/** Starts the machine's VNC server, for a demo that drives its screen. */
	vnc?: boolean;
	/** A private key the machine trusts; without one, the image's password signs in. */
	key?: string;
	tart?: string;
	user?: string;
	password?: string;
}

type Options = Required<Omit<GuestOptions, "key">> & Pick<GuestOptions, "key">;

/** What a command in the guest gets besides its text: its stdin, and ports of this Mac lent to it. */
export interface CommandIO {
	stdin?: string;
	/** Ports of this Mac's loopback that answer at the same port of the guest's while it runs. */
	lend?: readonly number[];
}

/** Where tart shares a folder named `name` in a macOS guest. */
export function sharedPath(name: string): string {
	return `/Volumes/My Shared Files/${name}`;
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

/** `tart run`'s arguments for the clone: never a window. */
function runArgs(o: Options): string[] {
	return ["run", o.name, "--no-graphics", ...(o.vnc ? ["--vnc-experimental"] : []), ...o.dirs.map(d => `--dir=${d}`)];
}

export class Guest {
	/** The VNC address, when the machine was started with its VNC server; empty otherwise. */
	readonly vncUrl: string;
	readonly ip: string;
	readonly #o: Options;
	readonly #process: ReturnType<typeof Bun.spawn>;
	readonly #work: string;

	private constructor(p: { o: Options; vm: ReturnType<typeof Bun.spawn>; vncUrl: string; ip: string; work: string }) {
		this.#o = p.o;
		this.#process = p.vm;
		this.vncUrl = p.vncUrl;
		this.ip = p.ip;
		this.#work = p.work;
	}

	static async start(options: GuestOptions): Promise<Guest> {
		const o: Options = {
			tart: process.env.TART ?? "tart",
			user: "admin",
			password: "admin",
			dirs: [],
			vnc: false,
			...options,
		};
		Bun.spawnSync([o.tart, "stop", o.name]);
		Bun.spawnSync([o.tart, "delete", o.name]);
		run([o.tart, "clone", o.base, o.name]);
		const vm = Bun.spawn([o.tart, ...runArgs(o)], { stdout: "pipe", stderr: "pipe" });
		const vncUrl = o.vnc ? await lineMatching(vm.stdout, /vnc:\/\/:\S+@[\d.]+:\d+/, 120_000) : "";
		let ip = "";
		for (let i = 0; i < 60 && !ip; i++) {
			ip = Bun.spawnSync([o.tart, "ip", o.name]).stdout.toString().trim();
			if (!ip) await Bun.sleep(2000);
		}
		const work = mkdtempSync(join(tmpdir(), "piebird-vm-"));
		const guest = new Guest({ o, vm, vncUrl, ip, work });
		for (let i = 0; i < 90; i++) {
			if (Bun.spawnSync(guest.#sshArgv(["true"]), { env: guest.#env() }).exitCode === 0) return guest;
			await Bun.sleep(2000);
		}
		await guest.stop();
		throw new Error(`${o.name} came up without SSH`);
	}

	/** SSH and scp's environment: with a password, an askpass program answers for it. */
	#env(): Record<string, string | undefined> {
		if (this.#o.key) return { ...process.env };
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

	#options(): string[] {
		const common = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR"];
		const auth = this.#o.key
			? ["-i", this.#o.key, "-o", "IdentitiesOnly=yes", "-o", "PasswordAuthentication=no"]
			: ["-o", "PubkeyAuthentication=no"];
		return [...common, ...auth];
	}

	/** ssh's argv for `command`; each port in `lend`, of this Mac's loopback, answers at the guest's. */
	#sshArgv(command: string[], lend: readonly number[] = []): string[] {
		const tunnels = lend.flatMap(port => ["-R", `${port}:127.0.0.1:${port}`]);
		const extra = tunnels.length > 0 ? [...tunnels, "-o", "ExitOnForwardFailure=yes"] : [];
		return ["ssh", ...this.#options(), ...extra, `${this.#o.user}@${this.ip}`, "--", ...command];
	}

	#spawn(command: string, io: CommandIO, output: "pipe" | "inherit") {
		return Bun.spawn(this.#sshArgv([command], io.lend), {
			stdin: io.stdin === undefined ? "ignore" : new TextEncoder().encode(io.stdin),
			stdout: output,
			stderr: output,
			env: this.#env(),
		});
	}

	/** Runs a shell command in the guest, as its user; its output. */
	async shell(command: string, io: CommandIO = {}): Promise<string> {
		const child = this.#spawn(command, io, "pipe");
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (code !== 0) throw new Error(`in the guest, ${command} failed: ${err.trim()}`);
		return out;
	}

	/** Runs a shell command in the guest with its output on this terminal; its exit status. */
	attached(command: string, io: CommandIO = {}): Promise<number> {
		return this.#spawn(command, io, "inherit").exited;
	}

	/**
	 * `command` with the user's login keychain unlocked first, as signing in at the screen unlocks
	 * it: macOS unlocks it for one login session, and each SSH command is a session of its own.
	 */
	keychainUnlocked(command: string): string {
		return `security unlock-keychain -p '${this.#o.password}' login.keychain-db && ${command}`;
	}

	/** Runs a shell command in the guest as root (the image's user may sudo with its password). */
	sudo(command: string): Promise<string> {
		return this.shell(`printf '%s\\n' '${this.#o.password}' | sudo -S -p '' sh -c ${JSON.stringify(command)}`);
	}

	/** Copies a file from here into the guest. */
	copy(local: string, remote: string): void {
		run(["scp", ...this.#options(), local, `${this.#o.user}@${this.ip}:${remote}`], this.#env());
	}

	/** Stops the machine and deletes it unless `keep`. */
	async stop(keep = false): Promise<void> {
		Bun.spawnSync([this.#o.tart, "stop", this.#o.name]);
		await this.#process.exited;
		if (!keep) Bun.spawnSync([this.#o.tart, "delete", this.#o.name]);
		rmSync(this.#work, { recursive: true, force: true });
	}
}
