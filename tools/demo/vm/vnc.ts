// A VNC client (RFB 3.8, VNC password authentication, raw pixels) for the desktop demos: it keeps
// one connection to a virtual machine's screen (tart's VNC server stops the VM after a few
// connections), keeps a copy of the screen current, and sends the pointer and keys.
import { createCipheriv } from "node:crypto";
import { connect, type Socket } from "node:net";

/** The DES key VNC derives from a password: its first 8 bytes, each byte's bits reversed. */
export function vncKey(password: string): Buffer {
	const key = Buffer.alloc(8);
	for (let i = 0; i < 8; i++) {
		const c = password.charCodeAt(i) || 0;
		let r = 0;
		for (let b = 0; b < 8; b++) if (c & (1 << b)) r |= 1 << (7 - b);
		key[i] = r;
	}
	return key;
}

/** The answer to the server's 16-byte challenge. */
export function authResponse(password: string, challenge: Uint8Array): Buffer {
	const des = createCipheriv("des-ecb", vncKey(password), null);
	des.setAutoPadding(false);
	return Buffer.concat([des.update(challenge), des.final()]);
}

/** `vnc://:<password>@<host>:<port>`, as tart prints it. */
export function parseVncUrl(url: string): { password: string; host: string; port: number } {
	const m = /^vnc:\/\/:([^@]*)@([^:]+):(\d+)/.exec(url.trim());
	if (!m) throw new Error(`not a VNC address: ${url}`);
	return { password: m[1] ?? "", host: m[2] ?? "", port: Number(m[3]) };
}

const RAW = 0;
const DESKTOP_SIZE = -223;

/** Where red, green and blue are in a pixel's 4 bytes, from the server's pixel format (32 bits a pixel). */
export function channelBytes(format: Uint8Array): [number, number, number] {
	const [bits, , bigEndian = 0] = format;
	if (bits !== 32) throw new Error(`the VNC server sends ${bits} bits a pixel; this reads 32`);
	const at = (shift: number) => (bigEndian ? 3 - shift / 8 : shift / 8);
	return [at(format[10] ?? 16), at(format[11] ?? 8), at(format[12] ?? 0)];
}

export class Vnc {
	#socket: Socket;
	#buffer = Buffer.alloc(0);
	#waiting: { n: number; done: (b: Buffer) => void; fail: (e: Error) => void }[] = [];
	#closed: Error | undefined;
	width = 0;
	height = 0;
	/** The screen, 4 bytes a pixel, as the server sends them (`#channels` says where each colour is). */
	pixels = new Uint8Array(0);
	#channels: [number, number, number] = [2, 1, 0];
	/** When the screen last changed, in performance.now() milliseconds. */
	changed = 0;
	#onUpdate: (() => void)[] = [];

	private constructor(socket: Socket) {
		this.#socket = socket;
		socket.on("data", (d: Buffer | string) => {
			this.#buffer = Buffer.concat([this.#buffer, typeof d === "string" ? Buffer.from(d) : d]);
			this.#pump();
		});
		socket.on("close", () => this.#fail(new Error("the VNC connection closed")));
		socket.on("error", e => this.#fail(e));
	}

	#fail(e: Error): void {
		this.#closed ??= e;
		for (const w of this.#waiting.splice(0)) w.fail(e);
	}

	#pump(): void {
		for (let w = this.#waiting[0]; w && this.#buffer.length >= w.n; w = this.#waiting[0]) {
			this.#waiting.shift();
			const out = Buffer.from(this.#buffer.subarray(0, w.n));
			this.#buffer = this.#buffer.subarray(w.n);
			w.done(out);
		}
	}

	#read(n: number): Promise<Buffer> {
		if (this.#closed) return Promise.reject(this.#closed);
		return new Promise((done, fail) => {
			this.#waiting.push({ n, done, fail });
			this.#pump();
		});
	}

	static async connect(url: string): Promise<Vnc> {
		const { password, host, port } = parseVncUrl(url);
		const socket = connect(port, host);
		await new Promise<void>((done, fail) => {
			socket.once("connect", done).once("error", fail);
		});
		const vnc = new Vnc(socket);
		await vnc.#handshake(password);
		await vnc.#update(false);
		void vnc.#follow();
		return vnc;
	}

	async #handshake(password: string): Promise<void> {
		await this.#read(12);
		this.#socket.write("RFB 003.008\n");
		const types = [...(await this.#read((await this.#read(1))[0] ?? 0))];
		if (!types.includes(2)) throw new Error(`the VNC server offers no password authentication (${types.join(",")})`);
		this.#socket.write(Buffer.from([2]));
		this.#socket.write(authResponse(password, await this.#read(16)));
		if ((await this.#read(4)).readUInt32BE(0) !== 0) throw new Error("the VNC password was refused");
		this.#socket.write(Buffer.from([1]));
		const init = await this.#read(24);
		this.#resize(init.readUInt16BE(0), init.readUInt16BE(2));
		this.#channels = channelBytes(init.subarray(4, 20));
		await this.#read(init.readUInt32BE(20));
		const encodings = Buffer.alloc(12);
		encodings.writeUInt16BE(0x0200, 0);
		encodings.writeUInt16BE(2, 2);
		encodings.writeInt32BE(RAW, 4);
		encodings.writeInt32BE(DESKTOP_SIZE, 8);
		this.#socket.write(encodings);
	}

	#resize(width: number, height: number): void {
		this.width = width;
		this.height = height;
		this.pixels = new Uint8Array(width * height * 4);
	}

	/** Keeps the copy current: the server answers an incremental request once the screen changes. */
	async #follow(): Promise<void> {
		while (!this.#closed) {
			try {
				await this.#update(true);
			} catch (e) {
				this.#fail(e instanceof Error ? e : new Error(String(e)));
			}
		}
	}

	async #update(incremental: boolean): Promise<void> {
		const request = Buffer.alloc(10);
		request[0] = 3;
		request[1] = incremental ? 1 : 0;
		request.writeUInt16BE(this.width, 6);
		request.writeUInt16BE(this.height, 8);
		this.#socket.write(request);
		await this.#skipToUpdate();
		const rects = (await this.#read(3)).readUInt16BE(1);
		for (let i = 0; i < rects; i++) await this.#rect();
		this.changed = performance.now();
		for (const done of this.#onUpdate.splice(0)) done();
	}

	/** Resolves once the next change to the screen has been applied. */
	nextUpdate(): Promise<void> {
		return new Promise(done => {
			this.#onUpdate.push(done);
		});
	}

	/** Reads past the server's other messages (colour map, bell, clipboard) to a screen update. */
	async #skipToUpdate(): Promise<void> {
		for (;;) {
			const type = (await this.#read(1))[0];
			if (type === 0) return;
			if (type === 1) await this.#read((await this.#read(5)).readUInt16BE(3) * 6);
			else if (type === 3) await this.#read((await this.#read(7)).readUInt32BE(3));
			else if (type !== 2) throw new Error(`unknown VNC message ${type}`);
		}
	}

	async #rect(): Promise<void> {
		const head = await this.#read(12);
		const [x, y, w, h] = [head.readUInt16BE(0), head.readUInt16BE(2), head.readUInt16BE(4), head.readUInt16BE(6)];
		const encoding = head.readInt32BE(8);
		if (encoding === DESKTOP_SIZE) return this.#resize(w, h);
		if (encoding !== RAW) throw new Error(`unexpected VNC encoding ${encoding}`);
		const data = await this.#read(w * h * 4);
		for (let row = 0; row < h; row++)
			this.pixels.set(data.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * this.width + x) * 4);
	}

	/** The screen as RGBA, opaque. */
	rgba(): Uint8ClampedArray {
		const out = new Uint8ClampedArray(this.pixels.length);
		const [r, g, b] = this.#channels;
		for (let i = 0; i < out.length; i += 4) {
			out[i] = this.pixels[i + r] ?? 0;
			out[i + 1] = this.pixels[i + g] ?? 0;
			out[i + 2] = this.pixels[i + b] ?? 0;
			out[i + 3] = 255;
		}
		return out;
	}

	/** The colour at (x, y) in the screen's pixels, as [red, green, blue]. */
	pixel(x: number, y: number): [number, number, number] {
		const i = (Math.round(y) * this.width + Math.round(x)) * 4;
		const [r, g, b] = this.#channels;
		return [this.pixels[i + r] ?? 0, this.pixels[i + g] ?? 0, this.pixels[i + b] ?? 0];
	}

	/** Whether the screen is all black, as it is while the machine starts or redraws its desktop. */
	blank(): boolean {
		const step = Math.max(4, Math.floor(this.pixels.length / 4096 / 4) * 4);
		for (let i = 0; i < this.pixels.length; i += step)
			if (this.pixels[i] || this.pixels[i + 1] || this.pixels[i + 2]) return false;
		return true;
	}

	/** Waits until the screen has stayed the same for `quietMs`, at most `timeoutMs`. */
	async settle(quietMs = 800, timeoutMs = 30_000): Promise<void> {
		const end = performance.now() + timeoutMs;
		while (performance.now() - this.changed < quietMs && performance.now() < end) await Bun.sleep(100);
	}

	pointer(x: number, y: number, buttons = 0): void {
		const m = Buffer.alloc(6);
		m[0] = 5;
		m[1] = buttons;
		m.writeUInt16BE(Math.round(x), 2);
		m.writeUInt16BE(Math.round(y), 4);
		this.#socket.write(m);
	}

	key(keysym: number, down: boolean): void {
		const m = Buffer.alloc(8);
		m[0] = 4;
		m[1] = down ? 1 : 0;
		m.writeUInt32BE(keysym, 4);
		this.#socket.write(m);
	}

	close(): void {
		this.#closed ??= new Error("closed");
		this.#socket.destroy();
	}
}
