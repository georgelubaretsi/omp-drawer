// A zip writer, enough for a .mcpb: deflated files with their Unix permissions, which Claude
// desktop keeps when it unpacks one (it runs the server's program directly, so the program must
// stay executable). Only what the zip format needs for that: no folders, no zip64 (a .mcpb stays
// far under 4 GiB).
import { deflateRawSync } from "node:zlib";
import type { PayloadFile } from "./payload";

/** CRC-32 as zip computes it (Bun.hash.crc32 is the same polynomial). */
function crc32(data: Uint8Array): number {
	return Bun.hash.crc32(data) >>> 0;
}

/** The DOS date and time zip records; fixed, so the same files make the same zip. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1; // 1980-01-01

function localHeader(name: Uint8Array, crc: number, sizes: { packed: number; plain: number }): Uint8Array {
	const h = Buffer.alloc(30);
	h.writeUInt32LE(0x04034b50, 0);
	h.writeUInt16LE(20, 4); // version needed: 2.0
	h.writeUInt16LE(0x0800, 6); // UTF-8 names
	h.writeUInt16LE(8, 8); // deflate
	h.writeUInt16LE(DOS_TIME, 10);
	h.writeUInt16LE(DOS_DATE, 12);
	h.writeUInt32LE(crc, 14);
	h.writeUInt32LE(sizes.packed, 18);
	h.writeUInt32LE(sizes.plain, 22);
	h.writeUInt16LE(name.length, 26);
	return Buffer.concat([h, name]);
}

function centralHeader(
	name: Uint8Array,
	entry: { crc: number; packed: number; plain: number; mode: number; offset: number },
): Uint8Array {
	const h = Buffer.alloc(46);
	h.writeUInt32LE(0x02014b50, 0);
	h.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0, so the mode below counts
	h.writeUInt16LE(20, 6);
	h.writeUInt16LE(0x0800, 8);
	h.writeUInt16LE(8, 10);
	h.writeUInt16LE(DOS_TIME, 12);
	h.writeUInt16LE(DOS_DATE, 14);
	h.writeUInt32LE(entry.crc, 16);
	h.writeUInt32LE(entry.packed, 20);
	h.writeUInt32LE(entry.plain, 24);
	h.writeUInt16LE(name.length, 28);
	h.writeUInt32LE(((0o100000 | entry.mode) << 16) >>> 0, 38); // a regular file with its mode
	h.writeUInt32LE(entry.offset, 42);
	return Buffer.concat([h, name]);
}

export function zip(files: readonly PayloadFile[]): Uint8Array {
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const f of files) {
		const name = new TextEncoder().encode(f.path);
		const packed = deflateRawSync(f.data);
		const crc = crc32(f.data);
		const local = localHeader(name, crc, { packed: packed.length, plain: f.data.length });
		central.push(centralHeader(name, { crc, packed: packed.length, plain: f.data.length, mode: f.mode, offset }));
		parts.push(local, packed);
		offset += local.length + packed.length;
	}
	const directory = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...parts, directory, end]);
}
