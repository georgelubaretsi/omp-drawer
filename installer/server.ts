// What the page asks of the installer: GET the page; POST an `op`. The page only names things the
// installer offered it (a plugin, an app to restart, the n-th file to open), never a path or a
// command; one install or removal runs at a time.
import { join } from "node:path";
import { install, uninstall } from "./flow";
import { type PageView, pageHtml } from "./page";
import { type Ctx, fieldsOf, firstLine, listOf, type Opening, type Step } from "./steps/context";
import { title } from "./steps/plugins";
import { type AppName, isRunning, openWith, restartApp } from "./system";

const APP_LABELS: Record<AppName, string> = { chatgpt: "ChatGPT", claude: "Claude" };

type Op = Readonly<Record<string, unknown>>;
type Answer = Record<string, unknown>;

export interface Hooks {
	readonly settingsUrl?: string;
	/** The page said it is closing. */
	bye(): void;
}

/** What the last install or removal left for the person to do. */
interface Offered {
	opens: readonly Opening[];
	restarts: readonly AppName[];
}

/** Which apps and agents are here, and where each plugin goes among them. */
export function viewOf(ctx: Ctx, settingsUrl?: string): PageView {
	const { omp, claude, codex, apps } = ctx.agents;
	const codexCommand = codex !== undefined && !(apps.chatgpt && codex.startsWith(apps.chatgpt));
	const agents = [
		{ label: "ChatGPT", found: apps.chatgpt !== undefined },
		{ label: "Claude", found: apps.claude !== undefined },
		{ label: "Claude Code", found: claude !== undefined },
		{ label: "Codex", found: codexCommand },
		{ label: "omp", found: omp !== undefined },
	];
	const plugins = ctx.plugins.map(p => {
		const goesTo = [
			...(p.hosts.includes("codex") && apps.chatgpt ? ["ChatGPT"] : []),
			...(p.hosts.includes("claude") && apps.claude ? [p.program ? "Claude" : "Claude's Code tab"] : []),
			...(p.hosts.includes("claude") && claude ? ["Claude Code"] : []),
			...(p.hosts.includes("codex") && codexCommand ? ["Codex"] : []),
			...(p.hosts.includes("omp") && omp ? ["omp"] : []),
		];
		return { name: p.name, title: title(p.name), description: p.description, goesTo };
	});
	return { agents, plugins, installed: ctx.sys.exists(ctx.dirs.market), ...(settingsUrl ? { settingsUrl } : {}) };
}

async function answer(ctx: Ctx, offered: Offered, steps: Step[], chosen: readonly string[]): Promise<Answer> {
	offered.opens = steps.flatMap(s => s.opens ?? []);
	const apps = [...new Set(steps.flatMap(s => (s.restart ? [s.restart] : [])))];
	const running = await Promise.all(apps.map(app => isRunning(ctx.sys, app)));
	offered.restarts = apps.filter((_, i) => running[i]);
	return {
		steps,
		opens: offered.opens.map(o => ({ label: o.label })),
		restarts: offered.restarts.map(app => ({ app, label: APP_LABELS[app] })),
		signIns: ctx.plugins
			.filter(p => p.vault && chosen.includes(p.name))
			.map(p => ({ plugin: p.name, label: `Sign in for ${title(p.name)}` })),
		installed: ctx.sys.exists(ctx.dirs.market),
	};
}

async function open(ctx: Ctx, offered: Offered, op: Op): Promise<Answer> {
	const o = typeof op.index === "number" ? offered.opens[op.index] : undefined;
	const app = o ? ctx.agents.apps[o.app] : undefined;
	if (!o || !app) return { text: "Nothing to open" };
	const label = APP_LABELS[o.app];
	return { text: (await openWith(ctx.sys, o.app, app, o.file)) ? `Opened in ${label}` : `${label} didn't open it` };
}

async function restart(ctx: Ctx, offered: Offered, op: Op): Promise<Answer> {
	const app = offered.restarts.find(a => a === op.app);
	const path = app ? ctx.agents.apps[app] : undefined;
	if (!app || !path) return { text: "Nothing to restart" };
	await restartApp(ctx.sys, app, path);
	return { text: `${APP_LABELS[app]} restarted` };
}

/** How long a vault's sign-in may wait for the person on its page before it's stopped. */
const SIGN_IN_MS = 10 * 60_000;

/** Runs the plugin's vault's sign-in, which opens its own page and waits for the person. */
async function signIn(ctx: Ctx, op: Op): Promise<Answer> {
	const p = ctx.plugins.find(x => x.name === op.plugin);
	if (!p?.vault) return { text: "No sign-in for that" };
	const vault = join(
		ctx.dirs.market,
		"plugins",
		p.name,
		"native",
		ctx.sys.platform === "win32" ? `${p.vault}.exe` : p.vault,
	);
	const ran = await ctx.sys.run([vault, "sign-in"], undefined, SIGN_IN_MS);
	const said = firstLine(ran.code === 0 ? ran.stdout : ran.stderr || ran.stdout);
	return { text: said || (ran.code === 0 ? "Signed in" : "Not signed in") };
}

function act(ctx: Ctx, offered: Offered, op: Op, hooks: Hooks): Promise<Answer> | Answer {
	switch (op.op) {
		case "install": {
			const names = listOf(op.plugins).filter(
				(n): n is string => typeof n === "string" && ctx.plugins.some(p => p.name === n),
			);
			return install(ctx, names).then(steps => answer(ctx, offered, steps, names));
		}
		case "uninstall":
			return uninstall(ctx).then(steps => answer(ctx, offered, steps, []));
		case "open":
			return open(ctx, offered, op);
		case "restart":
			return restart(ctx, offered, op);
		case "sign-in":
			return signIn(ctx, op);
		case "bye":
			hooks.bye();
			return {};
		default:
			return {};
	}
}

export function installerHandler(ctx: Ctx, hooks: Hooks): (req: Request) => Promise<Response> {
	const offered: Offered = { opens: [], restarts: [] };
	let busy = false;
	return async req => {
		if (req.method === "GET")
			return new Response(pageHtml(viewOf(ctx, hooks.settingsUrl)), {
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		if (req.method !== "POST") return new Response("Not allowed", { status: 405 });
		const op = fieldsOf(await req.json().catch(() => undefined));
		const long = op.op === "install" || op.op === "uninstall";
		if (long && busy) return Response.json({ text: "Already at work" }, { status: 409 });
		if (long) busy = true;
		try {
			return Response.json(await act(ctx, offered, op, hooks));
		} finally {
			if (long) busy = false;
		}
	};
}
