// omp's model gateway on this Mac, for the demo machine: `omp auth-broker serve` holds this
// Mac's omp sign-in, `omp auth-gateway serve` answers model requests with it. Both listen on
// loopback ports only; the gateway's is lent to the machine through its SSH connection (guest.ts),
// where omp sends its requests (place-machine.ts). The gateway runs without its own bearer
// (`--no-auth`): nothing goes into the machine, and the tokens stay here.
import { join } from "node:path";

/** A service this Mac runs for the demo machine: its loopback port, and how to stop it. */
export interface Lent {
	port: number;
	stop: () => void;
}

function freePort(): number {
	const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
	const { port } = server;
	server.stop(true);
	return port;
}

const answers = (url: string) =>
	fetch(url).then(
		r => r.ok,
		() => false,
	);

/**
 * Starts `omp <argv> --bind 127.0.0.1:<port>` and waits until `path` answers there. Its output goes
 * to `log`: a pipe nobody reads would stall it once full.
 */
async function serve(
	argv: string[],
	path: string,
	log: string,
	env?: Record<string, string | undefined>,
): Promise<Lent> {
	const port = freePort();
	const proc = Bun.spawn(["omp", ...argv, "--bind", `127.0.0.1:${port}`], {
		env,
		stdin: "ignore",
		stdout: Bun.file(log),
		stderr: Bun.file(log),
	});
	const stop = () => proc.kill();
	for (let i = 0; i < 150 && proc.exitCode === null; i++) {
		if (await answers(`http://127.0.0.1:${port}${path}`)) return { port, stop };
		await Bun.sleep(100);
	}
	stop();
	throw new Error(`omp ${argv.join(" ")} did not start: ${(await Bun.file(log).text()).trim()}`);
}

/**
 * The gateway as the machine sees it: everything but its catalog. omp lists the models a provider's
 * `/v1/models` names under that provider, and the gateway names every model this Mac's sign-ins
 * reach (`openrouter/…` among them), which a person's omp wouldn't list; without it, the machine's
 * omp lists the models it ships with, as a person's does.
 */
function withoutCatalog(gateway: number): Lent {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		idleTimeout: 0,
		fetch(req) {
			const url = new URL(req.url);
			if (req.method === "GET" && url.pathname === "/v1/models") return Response.json({ object: "list", data: [] });
			const to = `http://127.0.0.1:${gateway}${url.pathname}${url.search}`;
			// Uncompressed: fetch would hand back a decoded body still labelled as encoded.
			const headers = new Headers(req.headers);
			headers.delete("accept-encoding");
			headers.delete("host");
			return fetch(to, { method: req.method, headers, body: req.body, redirect: "manual" });
		},
	});
	return {
		port: server.port ?? 0,
		stop: () => {
			void server.stop(true);
		},
	};
}

/** The broker, then the gateway on it, logging into `logs`: the port the machine gets, and how to stop them. */
export async function lendGateway(logs: string): Promise<Lent> {
	const broker = await serve(["auth-broker", "serve"], "/v1/healthz", join(logs, "auth-broker.log"));
	try {
		const env = { ...process.env, OMP_AUTH_BROKER_URL: `http://127.0.0.1:${broker.port}` };
		const gateway = await serve(
			["auth-gateway", "serve", "--no-auth"],
			"/healthz",
			join(logs, "auth-gateway.log"),
			env,
		);
		const lent = withoutCatalog(gateway.port);
		return {
			port: lent.port,
			stop: () => {
				lent.stop();
				gateway.stop();
				broker.stop();
			},
		};
	} catch (error) {
		broker.stop();
		throw error;
	}
}
