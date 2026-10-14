import { afterEach, describe, expect, test } from "bun:test";
import { createServer, type Server, type Socket } from "node:net";
import { authResponse, channelBytes, parseVncUrl, Vnc, vncKey } from "./vnc";

const CHALLENGE = Buffer.from("0123456789abcdef");

interface Fake {
	url: string;
	server: Server;
	/** Resolves with the first message the client sends after signing in that starts with `type`. */
	message(type: number): Promise<Buffer>;
}

/** A VNC server with a 4×2 screen: it answers each screen request with the next of `updates`. */
function fakeServer(password: string, updates: Buffer[]): Promise<Fake> {
	const wanted: { type: number; done: (b: Buffer) => void }[] = [];
	const server = createServer((s: Socket) => {
		const steps = [
			() => s.write(Buffer.from([1, 2])),
			() => s.write(CHALLENGE),
			(d: Buffer) => s.write(Buffer.from([0, 0, 0, d.equals(authResponse(password, CHALLENGE)) ? 0 : 1])),
			() => {
				const init = Buffer.alloc(28);
				init.writeUInt16BE(4, 0);
				init.writeUInt16BE(2, 2);
				// tart's: 32 bits a pixel, little-endian, red shifted 16, green 8, blue 0.
				Buffer.from("2018000100ff00ff00ff100800000000", "hex").copy(init, 4);
				init.writeUInt32BE(4, 20);
				init.write("test", 24);
				s.write(init);
			},
		];
		s.write("RFB 003.008\n");
		s.on("data", (d: Buffer) => {
			const step = steps.shift();
			if (step) return step(d);
			for (let i = 0; i < d.length;) {
				const type = d[i] ?? 0;
				const size = { 0: 20, 2: 4 + 4 * d.readUInt16BE(i + 2), 3: 10, 4: 8, 5: 6 }[type] ?? d.length;
				const message = d.subarray(i, i + size);
				if (type === 3) s.write(updates.shift() ?? Buffer.alloc(0));
				const w = wanted.findIndex(x => x.type === type);
				if (w >= 0) wanted.splice(w, 1)[0]?.done(Buffer.from(message));
				i += size;
			}
		});
	});
	const message = (type: number) =>
		new Promise<Buffer>(m => {
			wanted.push({ type, done: m });
		});
	return new Promise(done => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			done({ url: `vnc://:${password}@127.0.0.1:${port}`, server, message });
		});
	});
}

function update(rects: { x: number; y: number; w: number; h: number; encoding: number; data?: Buffer }[]): Buffer {
	const parts = rects.flatMap(r => {
		const h = Buffer.alloc(12);
		[r.x, r.y, r.w, r.h].forEach((v, i) => h.writeUInt16BE(v, i * 2));
		h.writeInt32BE(r.encoding, 8);
		return [h, r.data ?? Buffer.alloc(0)];
	});
	return Buffer.concat([Buffer.from([0, 0, 0, rects.length]), ...parts]);
}

const blank = update([{ x: 0, y: 0, w: 4, h: 2, encoding: 0, data: Buffer.alloc(32) }]);

/** A 32-bit pixel format with the colours shifted as given. */
function format(bigEndian: number, r: number, g: number, b: number): Uint8Array {
	return Uint8Array.from([32, 24, bigEndian, 1, 0, 255, 0, 255, 0, 255, r, g, b, 0, 0, 0]);
}

let open: { vnc?: Vnc; server?: Server } = {};
afterEach(() => {
	open.vnc?.close();
	open.server?.close();
	open = {};
});

describe("VNC", () => {
	test("derives the DES key with each byte's bits reversed, padded with zeros", () => {
		expect([...vncKey("a")]).toEqual([0x86, 0, 0, 0, 0, 0, 0, 0]);
		expect([...vncKey("ABCDEFGHIJ")]).toEqual([0x82, 0x42, 0xc2, 0x22, 0xa2, 0x62, 0xe2, 0x12]);
	});

	test("reads tart's address", () => {
		expect(parseVncUrl("vnc://:fit-word-two-four@127.0.0.1:51201\n")).toEqual({
			password: "fit-word-two-four",
			host: "127.0.0.1",
			port: 51201,
		});
		expect(() => parseVncUrl("http://x")).toThrow("not a VNC address");
	});

	test("finds each colour's byte from the server's pixel format, either byte order", () => {
		expect(channelBytes(format(0, 16, 8, 0))).toEqual([2, 1, 0]);
		expect(channelBytes(format(1, 16, 8, 0))).toEqual([1, 2, 3]);
		expect(channelBytes(format(0, 0, 8, 16))).toEqual([0, 1, 2]);
		expect(() => channelBytes(Uint8Array.from([16, 16, 0, 1]))).toThrow("16 bits a pixel");
	});

	test("signs in, keeps the screen copy current and sends the pointer", async () => {
		const red = Buffer.from([0, 0, 255, 0, 0, 0, 255, 0]);
		const s = await fakeServer("secret", [blank, update([{ x: 1, y: 1, w: 2, h: 1, encoding: 0, data: red }])]);
		open.server = s.server;
		const vnc = await Vnc.connect(s.url);
		open.vnc = vnc;
		await vnc.nextUpdate();
		expect([vnc.width, vnc.height]).toEqual([4, 2]);
		expect([...vnc.pixels.subarray(20, 28)]).toEqual([...red]);
		expect([...vnc.rgba().subarray(20, 24)]).toEqual([255, 0, 0, 255]);
		expect([vnc.pixel(1, 1), vnc.pixel(2, 1), vnc.pixel(0, 0)]).toEqual([
			[255, 0, 0],
			[255, 0, 0],
			[0, 0, 0],
		]);
		const pointer = s.message(5);
		vnc.pointer(300, 2, 1);
		expect([...(await pointer)]).toEqual([5, 1, 1, 44, 0, 2]);
	});

	test("takes a new screen size when the server announces one", async () => {
		const s = await fakeServer("secret", [blank, update([{ x: 0, y: 0, w: 8, h: 6, encoding: -223 }])]);
		open.server = s.server;
		const vnc = await Vnc.connect(s.url);
		open.vnc = vnc;
		await vnc.nextUpdate();
		expect([vnc.width, vnc.height, vnc.pixels.length]).toEqual([8, 6, 8 * 6 * 4]);
	});

	test("refuses a wrong password", async () => {
		const s = await fakeServer("secret", []);
		open.server = s.server;
		const refused = await Vnc.connect(s.url.replace("secret", "wrong")).then(
			() => undefined,
			(e: unknown) => e,
		);
		expect(refused).toEqual(new Error("the VNC password was refused"));
	});
});
