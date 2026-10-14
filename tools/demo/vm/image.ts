#!/usr/bin/env bun
// `bun tools/demo/vm/image.ts` (from the workspace: just demo-image): builds the image the omp
// and Tern demos record in, piebird-demo-base, with Packer and tart (machine.pkr.hcl), from what
// this Mac has: Tern.app, omp's Nix closure and the flake's demo-machine (the recorder's tools).
// The dev shell has Packer and tart; omp must come from Nix. A key pair of its own, kept in
// ~/.cache/piebird-demo/, signs this Mac's tools in to the machine. The image holds no credential.
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PLUGINS = join(import.meta.dir, "..", "..", "..");
const TEMPLATE = join(import.meta.dir, "machine.pkr.hcl");
const TERN_APP = "/Applications/Tern.app";

/** Where the image's inputs and the key pair are kept between runs. */
export function stateDir(home = homedir()): string {
	return join(home, ".cache", "piebird-demo");
}

/** The Nix store path that holds `file`, or undefined when it isn't in the store. */
export function storePathOf(file: string): string | undefined {
	return /^\/nix\/store\/[0-9a-z]{32}-[^/]+/.exec(file)?.[0];
}

function run(argv: string[], options: { cwd?: string } = {}): string {
	const r = Bun.spawnSync(argv, { cwd: options.cwd, stdout: "pipe", stderr: "inherit" });
	if (r.exitCode !== 0) throw new Error(`${argv.slice(0, 2).join(" ")} failed (exit ${r.exitCode})`);
	return r.stdout.toString().trim();
}

/** The key pair the machine trusts; made once. */
export function keyPair(dir: string): { privateKey: string; publicKey: string } {
	const privateKey = join(dir, "id_ed25519");
	if (!existsSync(privateKey))
		run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", "piebird-demo", "-f", privateKey]);
	return { privateKey, publicKey: `${privateKey}.pub` };
}

function ompClosure(): string {
	const found = Bun.which("omp");
	const store = found ? storePathOf(realpathSync(found)) : undefined;
	if (!store) throw new Error("omp isn't from Nix here: the image copies omp's Nix closure");
	return store;
}

/** The flake's demo-machine: the recorder's tools, one closure to copy. */
function toolsClosure(): string {
	return run(["nix", "build", `${PLUGINS}#demo-machine`, "--no-link", "--print-out-paths"]);
}

function build(): void {
	const dir = stateDir();
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const keys = keyPair(dir);
	const ternZip = join(dir, "Tern.zip");
	if (!existsSync(TERN_APP)) throw new Error(`no ${TERN_APP} on this Mac`);
	run(["ditto", "-c", "-k", "--keepParent", TERN_APP, ternZip]);
	const closures = [ompClosure(), toolsClosure()].join(" ");
	run(["packer", "init", TEMPLATE]);
	const vars = {
		tern_zip: ternZip,
		ssh_public_key: keys.publicKey,
		ssh_private_key: keys.privateKey,
		closures,
	};
	const args = Object.entries(vars).flatMap(([k, v]) => ["-var", `${k}=${v}`]);
	const r = Bun.spawnSync(["packer", "build", "-force", ...args, TEMPLATE], { stdout: "inherit", stderr: "inherit" });
	if (r.exitCode !== 0) throw new Error("packer build failed");
}

if (import.meta.main) {
	try {
		build();
	} catch (error) {
		console.error(`demo image: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
