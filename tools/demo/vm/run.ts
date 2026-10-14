#!/usr/bin/env bun
// `bun tools/demo/vm/run.ts <demo>... [--keep] [--no-video]` (from the workspace: `just demo
// <demo>...`): records each demo in a throwaway clone of the demo machine (image.ts builds its
// image), so nothing opens on this Mac's screen (docs/demos.md, "Recording in a virtual machine").
// Each clone gets this checkout's plugins/ folder read-only, for the recorder, the marketplace the
// desktop installer gives omp (installer.ts' payload, built natives included, packages left out),
// which the machine installs the plugins from, and a folder of its own for the recording, which
// lands in demos/<demo>/. The recorder (record.ts) runs there as the machine's user
// (place-machine.ts); omp's model requests go to this Mac's gateway (lend.ts) through the SSH
// connection, and a credential the scenario names reaches it on stdin (credentials.ts). `--keep`
// leaves each clone stopped, with the recorder's folder, for a look.
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { payloadFor } from "../../installer";
import { loadScenario } from "../record";
import { secretsFor } from "../credentials";
import { Guest, sharedPath } from "./guest";
import { keyPair, stateDir } from "./image";
import { type Lent, lendGateway } from "./lend";

const BASE = "piebird-demo-base";
const PLUGINS = join(import.meta.dir, "..", "..", "..");
const OUTPUTS = ["demo.mp4", "demo.webp", "report.md"];
/** Puts Nix and the user's profile on PATH in a shell that isn't a login one. */
const NIX_PROFILE = "/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh";

/** Single-quoted for the guest's shell. */
function quoted(s: string): string {
	return `'${s.replaceAll("'", "'\\''")}'`;
}

/** The recorder's command line in the machine: Nix's tools on PATH, then record.ts. */
function recorder(demo: string, gateway: Lent, flags: readonly string[]): string {
	const record = ["bun", "tools/demo/record.ts", demo, "--out", sharedPath("out"), ...flags].map(quoted).join(" ");
	return [
		`. ${NIX_PROFILE}`,
		`cd ${quoted(sharedPath("plugins"))}`,
		`DEMO_GATEWAY_URL=http://127.0.0.1:${gateway.port} DEMO_MARKETPLACE=${quoted(sharedPath("market"))} ${record}`,
	].join(" && ");
}

/** The installer's marketplace for the machine's kind of Mac, written to `dir`. */
async function writeMarketplace(dir: string): Promise<void> {
	for (const f of await payloadFor("macos-arm64")) {
		const to = join(dir, f.path);
		mkdirSync(dirname(to), { recursive: true });
		writeFileSync(to, f.data, { mode: f.mode });
	}
}

type RunOptions = { keep: boolean; flags: string[]; logs: string; market: string };

/** Records `demo` in a clone of its own; whether it recorded cleanly. */
async function recordIn(demo: string, gateway: Lent, opts: RunOptions): Promise<boolean> {
	const scenario = await loadScenario(demo);
	const stdin = JSON.stringify(secretsFor(scenario.credentials ?? []));
	const out = mkdtempSync(join(tmpdir(), "piebird-demo-out-"));
	const guest = await Guest.start({
		base: BASE,
		name: `piebird-demo-${demo.replaceAll("/", "-")}`,
		key: keyPair(stateDir()).privateKey,
		dirs: [`plugins:${PLUGINS}:ro`, `market:${opts.market}:ro`, `out:${out}`],
	});
	try {
		// SSH can answer before macOS has mounted the Nix store's volume.
		await guest.shell(`for i in $(seq 1 120); do [ -e ${NIX_PROFILE} ] && exit 0; sleep 1; done; exit 1`);
		const code = await guest.attached(guest.keychainUnlocked(recorder(demo, gateway, opts.flags)), {
			lend: [gateway.port],
			stdin,
		});
		// A failed run still brings its report, the clue to what went wrong; what the window last
		// showed and omp's journals go beside the gateway's logs.
		const folder = join(PLUGINS, "demos", demo);
		mkdirSync(folder, { recursive: true });
		for (const file of OUTPUTS.filter(f => existsSync(join(out, f))))
			copyFileSync(join(out, file), join(folder, file));
		const slug = demo.replaceAll("/", "-");
		if (existsSync(join(out, "failure.png")))
			copyFileSync(join(out, "failure.png"), join(opts.logs, `${slug}-failure.png`));
		if (existsSync(join(out, "journals")))
			cpSync(join(out, "journals"), join(opts.logs, `${slug}-journals`), { recursive: true });
		if (code !== 0) console.error(`${demo}: the recorder exited ${code}; what it left is in ${opts.logs}`);
		return code === 0;
	} finally {
		await guest.stop(opts.keep);
		rmSync(out, { recursive: true, force: true });
	}
}

/** Runs `each` on every item, `jobs` at a time; whether every one returned true. */
async function pooled<T>(items: readonly T[], jobs: number, each: (item: T) => Promise<boolean>): Promise<boolean> {
	const queue = [...items];
	let clean = true;
	const worker = async () => {
		for (let item = queue.shift(); item !== undefined; item = queue.shift()) clean = (await each(item)) && clean;
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
	return clean;
}

if (import.meta.main) {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: { keep: { type: "boolean" }, "no-video": { type: "boolean" }, jobs: { type: "string", default: "1" } },
	});
	const jobs = Number(values.jobs);
	if (positionals.length === 0 || !Number.isInteger(jobs) || jobs < 1 || jobs > 2) {
		// macOS lets a Mac run two macOS virtual machines at a time, the owner's own included.
		console.error("usage: bun tools/demo/vm/run.ts <demo>... [--jobs 1|2] [--keep] [--no-video]");
		process.exit(2);
	}
	const keep = values.keep === true;
	const flags = [...(keep ? ["--keep"] : []), ...(values["no-video"] ? ["--no-video"] : [])];
	const logs = mkdtempSync(join(tmpdir(), "piebird-demo-logs-"));
	const market = mkdtempSync(join(tmpdir(), "piebird-demo-market-"));
	await writeMarketplace(market);
	const gateway = await lendGateway(logs);
	const record = (demo: string) =>
		recordIn(demo, gateway, { keep, flags, logs, market }).catch((error: unknown) => {
			console.error(`${demo}: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		});
	const clean = await pooled(positionals, jobs, record).finally(() => {
		gateway.stop();
		rmSync(market, { recursive: true, force: true });
	});
	if (!clean) console.error(`the gateway's and broker's logs, and what failed runs last showed: ${logs}`);
	else rmSync(logs, { recursive: true, force: true });
	process.exit(clean ? 0 : 1);
}
