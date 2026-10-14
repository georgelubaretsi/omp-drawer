// The plugins an installer carries: one gzipped file built with it, holding a header that lists
// each file (path, mode, size) and then the files' bytes in that order. Paths are relative, with
// forward slashes; one that would leave the folder it is unpacked into is refused.

export interface PayloadFile {
	readonly path: string;
	/** Unix permission bits; the native programs are executable. */
	readonly mode: number;
	readonly data: Uint8Array;
}

const MAGIC = "PIEBIRD-PAYLOAD-1\n";

/** Whether a payload path stays inside the folder it is unpacked into. */
export function safePath(path: string): boolean {
	if (path === "" || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
	return path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

export function packPayload(files: readonly PayloadFile[]): Uint8Array {
	for (const f of files) if (!safePath(f.path)) throw new Error(`payload path ${f.path} would leave its folder`);
	const header = JSON.stringify({ files: files.map(f => ({ path: f.path, mode: f.mode, size: f.data.length })) });
	const head = new TextEncoder().encode(`${MAGIC}${header}\n`);
	const body = new Uint8Array(head.length + files.reduce((n, f) => n + f.data.length, 0));
	body.set(head, 0);
	let at = head.length;
	for (const f of files) {
		body.set(f.data, at);
		at += f.data.length;
	}
	return Bun.gzipSync(body);
}

interface Entry {
	path: string;
	mode: number;
	size: number;
}

function entries(header: unknown): Entry[] {
	const files = typeof header === "object" && header !== null && "files" in header ? header.files : undefined;
	if (!Array.isArray(files)) throw new Error("not a piebird payload");
	return files.map((f: unknown) => {
		if (typeof f !== "object" || f === null) throw new Error("not a piebird payload");
		const { path, mode, size } = Object.fromEntries(Object.entries(f));
		if (typeof path !== "string" || typeof mode !== "number" || typeof size !== "number")
			throw new Error("not a piebird payload");
		if (!safePath(path)) throw new Error(`payload path ${path} would leave its folder`);
		return { path, mode, size };
	});
}

export function unpackPayload(gzipped: Uint8Array): PayloadFile[] {
	const body = Bun.gunzipSync(Uint8Array.from(gzipped));
	const magic = new TextEncoder().encode(MAGIC);
	if (!magic.every((b, i) => body[i] === b)) throw new Error("not a piebird payload");
	const newline = body.indexOf(0x0a, magic.length);
	const header: unknown = JSON.parse(new TextDecoder().decode(body.subarray(magic.length, newline)));
	let at = newline + 1;
	return entries(header).map(e => {
		const data = body.subarray(at, at + e.size);
		if (data.length !== e.size) throw new Error("the payload is cut short");
		at += e.size;
		return { path: e.path, mode: e.mode, data };
	});
}
