// omp side of the omp-bridge Tern plugin (../tern-plugin/window.luau); the file
// protocol is described at the top of that file.
//
// Requests are at most once: a request is only re-sent after omp itself withdrew it
// unclaimed (its rename succeeded, so no window can have run it). A claimed request
// that never answers is reported as indeterminate, never replayed.
import { constants, existsSync } from "node:fs";
import { open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const PLUGIN_ID = "omp-bridge";
/** The largest request file window.luau reads (its MAX_REQUEST_BYTES). */
export const MAX_REQUEST_BYTES = 1024 * 1024;

/** Tern's state directory, per docs.stencil.so/tern/concepts/packages.md ("Directories"). */
export function ternStateDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
	if (env.TERN_CONFIG_DIR) return env.TERN_CONFIG_DIR;
	const home = homedir();
	if (platform === "darwin") return join(home, "Library", "Application Support", "Tern");
	if (platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Tern");
	return join(env.XDG_STATE_HOME ?? join(home, ".local", "state"), "tern");
}

export function bridgeDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
	return join(ternStateDir(env, platform), "plugin-data", PLUGIN_ID);
}

/**
 * Whether the pane's session daemon runs on another machine than the person driving it,
 * from the pane's TERN_IDENTITY: an identity chain whose hops each carry a `method`
 * (`local`, `ssh-key` or `tailscale`). Missing or unreadable means local.
 */
export function isRemotePane(identity: string | undefined): boolean {
	if (!identity) return false;
	let chain: unknown;
	try {
		chain = JSON.parse(identity);
	} catch {
		return false;
	}
	if (!chain || typeof chain !== "object" || !("hops" in chain) || !Array.isArray(chain.hops)) return false;
	return chain.hops.some(
		(hop: unknown) =>
			!!hop &&
			typeof hop === "object" &&
			"method" in hop &&
			typeof hop.method === "string" &&
			hop.method !== "local",
	);
}

export type Outcome =
	/** `window`: the token of the window that answered; pass it back as `CallOptions.window`. */
	| { kind: "answer"; ok: boolean; result: unknown; printed?: string; note?: string; window: string }
	/** No window took the request, even after a plugin reload; it was withdrawn, so it never ran. */
	| { kind: "unclaimed" }
	/** A window took the request but no answer came; it may have run partly or fully. */
	| { kind: "indeterminate"; reason: string; reloaded: boolean }
	/** Aborted before any window took the request; it never ran. */
	| { kind: "cancelled" }
	/** The Tern plugin has never loaded (its data folder is missing), even after a reload. */
	| { kind: "not_loaded" }
	/** The encoded request is larger than window.luau reads; nothing was sent. */
	| { kind: "too_large"; bytes: number };

export interface CallOptions {
	dir: string;
	pane: number;
	code: string;
	timeoutMs: number;
	/** Runs `tern plugin reload`. */
	reload: () => Promise<void>;
	signal?: AbortSignal;
	/**
	 * The window that answered this caller before (`answer.window`). While it listens, only it may
	 * take the request, so a pane shown in several windows keeps using one window and its `state`.
	 */
	window?: string;
	/** How long a request may wait unclaimed before omp withdraws it. */
	claimMs?: number;
	/** How often omp wakes the windows while a request waits to be claimed. */
	wakeMs?: number;
	/** How often omp checks that the claiming window still listens; three misses in a row end the wait. */
	checkMs?: number;
	pollMs?: number;
}

type Attempt =
	| Exclude<Outcome, { kind: "indeterminate" | "not_loaded" | "too_large" }>
	/** `stopped`: the claiming window stopped listening, so its bridge is gone. */
	| { kind: "indeterminate"; reason: string; stopped: boolean };

const WAKE_PIPE = /^wake-(.+)\.fifo$/;
const RESULT_TTL_MS = 60 * 60 * 1000;
const DEAD_PIPE_TTL_MS = 24 * 60 * 60 * 1000;
const MISSED_CHECKS = 3;
/** Seconds a request stays runnable after omp's claim deadline, so a live omp always withdraws it first. */
const REQUEST_GRACE_S = 30;

/** `<expires>-<pane>-<unique>`: windows skip expired requests and other windows' panes by name, without reading them. */
const REQUEST_NAME = /^\.?(\d+)-\d+-[\w-]+\.(json|tmp)$/;

let sequence = 0;

/** A request id; windows never run a request once the clock reaches `expires` (unix seconds). */
function newId(pane: number, claimMs: number): string {
	sequence += 1;
	const expires = Math.ceil((Date.now() + claimMs) / 1000) + REQUEST_GRACE_S;
	return `${expires}-${pane}-${process.pid}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The request file's body; only `window` may run it when set. */
function encodeRequest(code: string, window: string | undefined): string {
	return JSON.stringify({ code, window });
}

function errorCode(err: unknown): unknown {
	return err instanceof Error && "code" in err ? err.code : undefined;
}

/**
 * Takes a request back by renaming it to `to`, as windows take requests: rename(2) lets exactly one
 * side have it, while on macOS two concurrent unlinks of one file can both succeed. True when omp
 * took it back; false when a window had already taken it.
 */
async function withdraw(req: string, to: string): Promise<boolean> {
	try {
		await rename(req, to);
	} catch (err) {
		if (errorCode(err) === "ENOENT") return false;
		throw err;
	}
	await rm(to, { force: true });
	return true;
}

/** Opens and closes a window's wake pipe; false when no window is reading it. */
async function wake(pipe: string): Promise<boolean> {
	try {
		const handle = await open(pipe, constants.O_WRONLY | constants.O_NONBLOCK);
		await handle.close();
		return true;
	} catch (err) {
		const code = errorCode(err);
		if (code === "ENXIO" || code === "ENOENT") return false;
		throw err;
	}
}

/** Wakes every window; only the one holding the caller's pane claims the request. */
async function wakeAll(dir: string): Promise<void> {
	const pipes = (await readdir(dir).catch(() => [] as string[])).filter(name => WAKE_PIPE.test(name));
	await Promise.all(pipes.map(name => wake(join(dir, name))));
}

/** Requests past their expiry (an omp died before withdrawing them); windows already skip them by name. */
async function removeExpiredRequests(dir: string, now: number): Promise<void> {
	for (const name of await readdir(join(dir, "req")).catch(() => [] as string[])) {
		const expires = REQUEST_NAME.exec(name)?.[1];
		if (expires && Number(expires) * 1000 <= now) await rm(join(dir, "req", name), { force: true });
	}
}

async function removeOldResults(dir: string, now: number): Promise<void> {
	for (const name of await readdir(join(dir, "res")).catch(() => [] as string[])) {
		const path = join(dir, "res", name);
		const info = await stat(path).catch(() => undefined);
		if (info && now - info.mtimeMs > RESULT_TTL_MS) await rm(path, { force: true });
	}
}

/** A reloaded or closed window leaves its pipe behind; waking it first releases any orphaned reader. */
async function removeDeadPipes(dir: string, now: number): Promise<void> {
	for (const name of await readdir(dir).catch(() => [] as string[])) {
		if (!WAKE_PIPE.test(name)) continue;
		const path = join(dir, name);
		const info = await stat(path).catch(() => undefined);
		if (info && now - info.mtimeMs > DEAD_PIPE_TTL_MS && !(await wake(path))) await rm(path, { force: true });
	}
}

async function removeStale(dir: string): Promise<void> {
	const now = Date.now();
	await removeExpiredRequests(dir, now);
	await removeOldResults(dir, now);
	await removeDeadPipes(dir, now);
}

interface Timing {
	claimMs: number;
	wakeMs: number;
	checkMs: number;
	pollMs: number;
}

/** One request on its way: its files and how the wait for it is going. */
interface Exchange {
	o: CallOptions;
	t: Timing;
	window: string | undefined;
	req: string;
	res: string;
	start: number;
	lastWake: number;
	lastCheck: number;
	missed: number;
	pinMisses: number;
}

/** The fields of res/<id>.json omp reads; any of them may be missing. */
interface AnswerBody {
	ok?: unknown;
	result?: unknown;
	printed?: unknown;
	result_note?: unknown;
}

function isAnswerBody(value: unknown): value is AnswerBody {
	return typeof value === "object" && value !== null;
}

async function readAnswer(res: string): Promise<Attempt> {
	const parsed: unknown = JSON.parse(await readFile(`${res}.json`, "utf8"));
	// A JSON null was never a readable answer; other non-objects read as one with no fields.
	if (parsed === null) throw new TypeError(`${res}.json holds null, not an answer`);
	const body = isAnswerBody(parsed) ? parsed : {};
	return {
		kind: "answer",
		ok: body.ok === true,
		result: body.result,
		printed: typeof body.printed === "string" ? body.printed : undefined,
		note: typeof body.result_note === "string" ? body.result_note : undefined,
		window: (await readFile(`${res}.claimed`, "utf8").catch(() => "")).trim(),
	};
}

async function cancel(x: Exchange, waiting: boolean): Promise<Attempt> {
	if (waiting && (await withdraw(x.req, `${x.res}.withdrawn`))) return { kind: "cancelled" };
	return { kind: "indeterminate", reason: "cancelled after a Tern window took the request", stopped: false };
}

/** The request still waits in req/: withdraw it once its time is up, otherwise wake the windows. */
async function whileWaiting(x: Exchange, now: number): Promise<Attempt | undefined> {
	const elapsed = now - x.start;
	if ((elapsed >= x.t.claimMs || elapsed >= x.o.timeoutMs) && (await withdraw(x.req, `${x.res}.withdrawn`)))
		return { kind: "unclaimed" };
	if (now - x.lastWake < x.t.wakeMs) return undefined;
	x.lastWake = now;
	if (!x.window) {
		await wakeAll(x.o.dir);
		return undefined;
	}
	// Only the pinned window may take it. A woken window's reader is gone for a moment while
	// it re-arms (other callers wake it too), so only a missing pipe or two misses a round
	// apart mean that window closed or was reloaded.
	const pipe = join(x.o.dir, `wake-${x.window}.fifo`);
	x.pinMisses = (await wake(pipe)) ? 0 : x.pinMisses + 1;
	if ((x.pinMisses >= 2 || !existsSync(pipe)) && (await withdraw(x.req, `${x.res}.withdrawn`)))
		return { kind: "unclaimed" };
	return undefined;
}

/** A window took the request: wait for its answer while it keeps listening. */
async function whileClaimed(x: Exchange, now: number): Promise<Attempt | undefined> {
	const token = (await readFile(`${x.res}.claimed`, "utf8").catch(() => "")).trim();
	if (now - x.lastCheck >= x.t.checkMs) {
		x.lastCheck = now;
		// A window records its token right after taking a request, so a token still missing
		// checks later means it was stopped mid-claim: that counts as a window that stopped listening.
		x.missed = token && (await wake(join(x.o.dir, `wake-${token}.fifo`))) ? 0 : x.missed + 1;
		if (x.missed >= MISSED_CHECKS) {
			return {
				kind: "indeterminate",
				reason:
					"the Tern window that took the request stopped listening (most likely the code ran past Tern's 50 ms plugin budget, or the window closed)",
				stopped: true,
			};
		}
	}
	if (now - x.start >= x.o.timeoutMs) {
		return {
			kind: "indeterminate",
			reason: `no answer within ${Math.round(x.o.timeoutMs / 1000)} s`,
			stopped: false,
		};
	}
	return undefined;
}

/** One poll of the exchange; undefined while it goes on. */
async function step(x: Exchange): Promise<Attempt | undefined> {
	if (existsSync(`${x.res}.done`)) return readAnswer(x.res);
	const waiting = existsSync(x.req);
	const now = Date.now();
	if (x.o.signal?.aborted) return cancel(x, waiting);
	return waiting ? whileWaiting(x, now) : whileClaimed(x, now);
}

async function attempt(o: CallOptions, window: string | undefined, t: Timing): Promise<Attempt> {
	const id = newId(o.pane, t.claimMs);
	const reqDir = join(o.dir, "req");
	const tmp = join(reqDir, `.${id}.tmp`);
	const x: Exchange = {
		o,
		t,
		window,
		req: join(reqDir, `${id}.json`),
		res: join(o.dir, "res", id),
		start: 0,
		lastWake: -Infinity,
		lastCheck: -Infinity,
		missed: 0,
		pinMisses: 0,
	};
	await writeFile(tmp, encodeRequest(o.code, window));
	await rename(tmp, x.req);
	x.start = Date.now();
	try {
		for (;;) {
			const outcome = await step(x);
			if (outcome) return outcome;
			await Bun.sleep(t.pollMs);
		}
	} finally {
		await rm(tmp, { force: true });
		for (const suffix of [".json", ".done", ".claimed", ".taken", ".withdrawn"])
			await rm(`${x.res}${suffix}`, { force: true });
	}
}

/** Reloads Tern's plugins when the bridge's folder is missing; false when it still doesn't appear. */
async function ensureLoaded(o: CallOptions, t: Timing): Promise<boolean> {
	if (existsSync(join(o.dir, "req"))) return true;
	await o.reload();
	const until = Date.now() + t.claimMs;
	while (!existsSync(join(o.dir, "req")) && Date.now() < until) await Bun.sleep(t.pollMs);
	return existsSync(join(o.dir, "req"));
}

async function attemptUntilClaimed(o: CallOptions, t: Timing): Promise<Attempt> {
	let result = await attempt(o, o.window, t);
	// The pinned window is gone or no longer shows the pane; let any window that does take it.
	if (result.kind === "unclaimed" && o.window) result = await attempt(o, undefined, t);
	if (result.kind === "unclaimed") {
		// An unclaimed request means no window showing the pane runs the bridge (disabled by
		// the budget, or not started yet). Reload once.
		await o.reload();
		result = await attempt(o, undefined, t);
	}
	return result;
}

export async function call(o: CallOptions): Promise<Outcome> {
	const t: Timing = {
		claimMs: o.claimMs ?? 5000,
		wakeMs: o.wakeMs ?? 1000,
		checkMs: o.checkMs ?? 2000,
		pollMs: o.pollMs ?? 50,
	};
	const bytes = Buffer.byteLength(encodeRequest(o.code, o.window));
	if (bytes > MAX_REQUEST_BYTES) return { kind: "too_large", bytes };

	if (!(await ensureLoaded(o, t))) return { kind: "not_loaded" };
	await removeStale(o.dir);

	const result = await attemptUntilClaimed(o, t);
	if (result.kind !== "indeterminate") return result;
	// The claiming window's bridge is gone; reload now so the next call finds one.
	if (result.stopped) await o.reload();
	return { kind: "indeterminate", reason: result.reason, reloaded: result.stopped };
}
