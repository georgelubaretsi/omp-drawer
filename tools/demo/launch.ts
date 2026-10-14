// Starting an agent in a demo pane and knowing when it takes a prompt. omp draws itself as a Tern
// agent block, so its composer shows in the window's element tree; Claude Code and Codex are
// terminal programs, read from the pane's text (`tern capture`).
import type { TernWindow } from "./window";

/** omp's empty composer, shown once omp is ready for a prompt. */
export const OMP_READY = "What are we cooking?";

/**
 * What each terminal agent shows once it takes a prompt, and a question it may ask first with the
 * keys that answer yes from what the screen shows. Claude Code asks whether you trust a new folder,
 * with "No, exit" chosen: the keys move to yes first, then confirm.
 */
const TERMINAL = {
	claude: {
		ready: /\? for shortcuts|shift\+tab to cycle/,
		ask: /Yes, I trust this folder/,
		yes: (screen: string) => (/❯\s*Yes, I trust/.test(screen) ? ["Enter"] : ["Down"]),
	},
	codex: { ready: /context left|\? for shortcuts/i, ask: /Do you trust|trust this folder/i, yes: () => ["Enter"] },
} as const;

const list = (value: unknown, key: string): unknown[] => {
	const found: unknown = value && typeof value === "object" ? Reflect.get(value, key) : undefined;
	return Array.isArray(found) ? found : [];
};
const shown = (value: unknown) => !!value && typeof value === "object" && Reflect.get(value, "shown") === true;

/** The focused block of the tab on screen, from `tern ls --json`'s answer (each tab has a focused block). */
export function focusedBlock(ls: unknown): number | undefined {
	for (const session of list(ls, "sessions").filter(shown))
		for (const tab of list(session, "tabs").filter(shown))
			for (const block of list(tab, "blocks")) {
				const id: unknown = block && typeof block === "object" ? Reflect.get(block, "id") : undefined;
				if (Reflect.get(Object(block), "focused") === true && typeof id === "number") return id;
			}
	return undefined;
}

/** The block of the newest tab (the highest id) in `tern ls --json`'s answer: a tab just opened. */
export function newestTabBlock(ls: unknown): number | undefined {
	let newest: { tab: number; block: number } | undefined;
	for (const session of list(ls, "sessions"))
		for (const tab of list(session, "tabs")) {
			const id: unknown = Reflect.get(Object(tab), "id");
			const block: unknown = Reflect.get(Object(list(tab, "blocks")[0]), "id");
			if (typeof id === "number" && typeof block === "number" && (!newest || id > newest.tab))
				newest = { tab: id, block };
		}
	return newest?.block;
}

/**
 * Waits until Claude Code or Codex takes a prompt in `block`, accepting a trust prompt on the way;
 * keys sent while the program is still drawing it are lost, so a question still shown is answered
 * again.
 */
export async function untilReady(
	window: TernWindow,
	agent: keyof typeof TERMINAL,
	block: number | undefined,
	timeoutMs = 90_000,
): Promise<void> {
	const { ready, ask, yes } = TERMINAL[agent];
	let screen = "";
	let answered = 0;
	for (const until = performance.now() + timeoutMs; performance.now() < until; await Bun.sleep(500)) {
		const captured: unknown = await window.cli("capture", block ?? "@focused").catch(() => "");
		screen = typeof captured === "string" ? captured : JSON.stringify(captured);
		if (ask.test(screen)) {
			if (performance.now() - answered < 1500) continue;
			for (const key of yes(screen)) await window.ctl("key", key);
			answered = performance.now();
		} else if (ready.test(screen)) {
			await Bun.sleep(500);
			return;
		}
	}
	throw new Error(`${agent} never took a prompt; its pane shows:\n${screen}`);
}
