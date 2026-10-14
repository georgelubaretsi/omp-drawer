// What a call through the bridge ends with (src/bridge.ts performs it; output.ts words it).

/** The largest request, JSON-encoded, that the Tern half reads. */
export const MAX_REQUEST_BYTES = 1024 * 1024;

/**
 * Why a claimed request has no outcome: the call was cancelled, the claiming window stopped
 * listening, or no answer came within the call's timeout.
 */
export type Cause = "cancelled" | "stopped" | "timedOut";

export type Outcome =
	/** `window`: the token of the window that answered; pass it back as `CallOptions.window`. */
	| { kind: "answer"; ok: boolean; result: unknown; printed?: string; note?: string; window: string }
	/** No window took the request, even after a plugin reload; it was withdrawn, so it never ran. */
	| { kind: "unclaimed" }
	/** A window took the request but no answer came; it may have run partly or fully. */
	| { kind: "indeterminate"; cause: Cause; reloaded: boolean }
	/** Aborted before any window took the request; it never ran. */
	| { kind: "cancelled" }
	/** The Tern plugin has never loaded (its data folder is missing), even after a reload. */
	| { kind: "not_loaded" }
	/** The encoded request is larger than window.luau reads; nothing was sent. */
	| { kind: "too_large"; bytes: number };
