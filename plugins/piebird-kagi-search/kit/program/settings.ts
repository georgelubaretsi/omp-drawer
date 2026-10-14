// The settings page served: GET shows it, POST saves the person's choices into their file, whole
// or not at all. A file that isn't JSON or can't be read is left alone: saving would lose what the
// person wrote.
// The build copies kit/ into each plugin that needs it (plugins/<name>/kit/); edit it in kit/.
import { homedir } from "node:os";
import { join } from "node:path";
import { readIfThere, replaceFile } from "./files";
import { SETTINGS_PATH } from "../core/settings";
import { type LocalPage, openBrowser, serveLocalPage } from "./local-page";
import { type PagePlugin, settingsHtml, withChoices } from "./settings-page";

/** The person's settings file. */
export function personalSettingsFile(home: string = homedir()): string {
	return join(home, SETTINGS_PATH);
}

/** The file's JSON (undefined when there is no file), or why it can't be used: unreadable, not JSON. */
function readFile(path: string): { readonly value: unknown } | { readonly problem: string } {
	let text: string | undefined;
	try {
		text = readIfThere(path);
	} catch (error) {
		return { problem: error instanceof Error ? error.message : `${path} couldn't be read` };
	}
	if (text === undefined) return { value: undefined };
	try {
		const value: unknown = JSON.parse(text);
		return { value };
	} catch {
		return { problem: `${path} isn't JSON: fix it, or delete it to start afresh.` };
	}
}

function save(plugins: readonly PagePlugin[], path: string, choices: unknown): string[] {
	const read = readFile(path);
	if ("problem" in read) return [read.problem];
	let file = read.value;
	if (typeof choices !== "object" || choices === null) return ["The page sent no choices."];
	const problems: string[] = [];
	const entries: [string, unknown][] = Object.entries(choices);
	for (const [name, settings] of entries) {
		const plugin = plugins.find(p => p.name === name);
		if (!plugin || typeof settings !== "object" || settings === null) {
			problems.push(`No plugin ${name} here.`);
			continue;
		}
		const values: [string, unknown][] = Object.entries(settings);
		const next = withChoices(file, plugin, Object.fromEntries(values));
		problems.push(...next.problems);
		file = next.file;
	}
	if (problems.length === 0) replaceFile(path, `${JSON.stringify(file, null, 2)}\n`);
	return problems;
}

/** The page's handler for `plugins`, keeping the choices in the file at `path`. */
export function settingsHandler(plugins: readonly PagePlugin[], path: string): (req: Request) => Promise<Response> {
	return async req => {
		if (req.method === "GET") {
			const read = readFile(path);
			return new Response(settingsHtml(plugins, "value" in read ? read.value : undefined), {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		}
		if (req.method !== "POST") return new Response("Not allowed", { status: 405 });
		const problems = save(plugins, path, await req.json().catch(() => undefined));
		return Response.json(problems.length === 0 ? { saved: true } : { problems }, {
			status: problems.length === 0 ? 200 : 400,
		});
	};
}

/**
 * Serves the page and opens it in the browser, until no request has come for `idleMinutes`; what it
 * printed is the page's address, for when no browser opened.
 */
export async function runSettingsPage(
	plugins: readonly PagePlugin[],
	o: { path?: string; idleMinutes?: number } = {},
): Promise<void> {
	let last = Date.now();
	const handle = settingsHandler(plugins, o.path ?? personalSettingsFile());
	const page: LocalPage = serveLocalPage(req => {
		last = Date.now();
		return handle(req);
	});
	const opened = openBrowser(page.url);
	process.stderr.write(
		`${opened ? "Opened" : "Open"} ${page.url} for the settings; this stops after a while unused.\n`,
	);
	const idle = (o.idleMinutes ?? 15) * 60_000;
	while (Date.now() - last < idle) await Bun.sleep(5000);
	page.stop();
}
