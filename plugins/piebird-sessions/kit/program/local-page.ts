// A page served to the person at this computer, as the vaults' pages are (internal/localpage): on
// 127.0.0.1, behind a random path, refusing any other host name or path (a site in their browser
// could otherwise reach it through a name it controls: DNS rebinding), and never cached.
// The build copies kit/ into each plugin that needs it (plugins/<name>/kit/); edit it in kit/.

export interface LocalPage {
	/** The page's address, its secret path included. */
	readonly url: string;
	stop(): void;
}

function randomPath(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return `/${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}/`;
}

/** Serves `handle` at a new address; it sees only requests for the page's own host and path. */
export function serveLocalPage(handle: (req: Request) => Response | Promise<Response>): LocalPage {
	const path = randomPath();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(req) {
			if (req.headers.get("host") !== `127.0.0.1:${server.port}` || new URL(req.url).pathname !== path)
				return new Response("Not found", { status: 404 });
			const res = await handle(req);
			res.headers.set("Cache-Control", "no-store");
			res.headers.set("Referrer-Policy", "no-referrer");
			return res;
		},
	});
	return { url: `http://127.0.0.1:${server.port}${path}`, stop: () => void server.stop(true) };
}

/** The command that opens a URL in the default browser here; undefined where there is none. */
export function browserCommand(url: string, platform: NodeJS.Platform = process.platform): string[] | undefined {
	if (platform === "darwin") return ["open", url];
	// rundll32 hands the URL to the browser whole; `cmd /c start` would split it at `&`.
	if (platform === "win32") return ["rundll32", "url.dll,FileProtocolHandler", url];
	if (platform === "linux" || platform === "freebsd" || platform === "openbsd") return ["xdg-open", url];
	return undefined;
}

/** Opens `url` in the default browser; false when there is no way to here. */
export function openBrowser(url: string): boolean {
	const cmd = browserCommand(url);
	if (!cmd) return false;
	try {
		Bun.spawn({ cmd, stdin: "ignore", stdout: "ignore", stderr: "ignore" });
		return true;
	} catch {
		return false;
	}
}
