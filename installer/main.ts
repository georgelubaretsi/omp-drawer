// The desktop installer: finds the agents here, serves its page and opens it in the browser, and
// quits soon after the page is closed. Its plugins come built in (the build embeds payload.bin), or
// from `--payload <file>` when run from source.
import { serveLocalPage, openBrowser } from "../kit/program/local-page";
import { personalSettingsFile, settingsHandler } from "../kit/program/settings";
import { type PayloadFile, unpackPayload } from "./core/payload";
import { installerHandler } from "./server";
import { dirsFor } from "./steps/context";
import { pluginsOf, title } from "./steps/plugins";
import { findAgents, realSys } from "./system";

/**
 * How long the installer waits: for the page to first ask, after the page last asked (a hidden
 * tab's timers may run once a minute), and after it said goodbye (longer than its 5-second beat).
 */
const WAIT = { first: 10 * 60_000, idle: 3 * 60_000, bye: 8_000 };

async function payload(argv: readonly string[]): Promise<PayloadFile[]> {
	const at = argv.indexOf("--payload");
	const file = at >= 0 ? argv[at + 1] : undefined;
	if (file) return unpackPayload(await Bun.file(file).bytes());
	const embedded = Bun.embeddedFiles.find(f => "name" in f && f.name === "payload.bin");
	if (!embedded) throw new Error("this installer carries no plugins; run it with --payload <file>");
	return unpackPayload(await embedded.bytes());
}

async function main(argv: readonly string[]): Promise<number> {
	const files = await payload(argv);
	const sys = realSys();
	const ctx = { sys, agents: await findAgents(sys), payload: files, plugins: pluginsOf(files), dirs: dirsFor(sys) };
	let last = Date.now();
	let asked = false;
	let byeAt: number | undefined;
	/** Requests still being answered: a vault's sign-in waits for the person, minutes at most. */
	let pending = 0;
	const answered = () => {
		pending--;
		last = Date.now();
	};
	const seen =
		<T>(handle: (req: Request) => T) =>
		(req: Request): T => {
			last = Date.now();
			asked = true;
			byeAt = undefined;
			const answer = handle(req);
			if (answer instanceof Promise) {
				pending++;
				answer.then(answered, answered);
			}
			return answer;
		};
	const withSettings = ctx.plugins.flatMap(p =>
		p.declared ? [{ name: p.name, title: title(p.name), declared: p.declared }] : [],
	);
	const settings =
		withSettings.length > 0
			? serveLocalPage(seen(settingsHandler(withSettings, personalSettingsFile(sys.home))))
			: undefined;
	const page = serveLocalPage(
		seen(
			installerHandler(ctx, {
				...(settings ? { settingsUrl: settings.url } : {}),
				bye: () => void (byeAt = Date.now()),
			}),
		),
	);
	const opened = !argv.includes("--no-browser") && openBrowser(page.url);
	console.log(`${opened ? "Opened" : "Open"} ${page.url}`);
	for (;;) {
		await Bun.sleep(500);
		const now = Date.now();
		// A sign-in still waiting is let finish or time out, so its vault isn't left running.
		if (pending > 0) continue;
		if (byeAt !== undefined && now - byeAt > WAIT.bye) break;
		if (now - last > (asked ? WAIT.idle : WAIT.first)) break;
	}
	page.stop();
	settings?.stop();
	return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
