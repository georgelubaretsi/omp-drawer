// Recording in the demo machine (vm/run.ts): a throwaway macOS virtual machine, set up as a person
// sets up omp and Tern. The recorder runs as the machine's user, in its own home: omp's settings,
// the marketplace the desktop installer gives omp added and the plugins installed from it (`omp
// plugin marketplace add`, `omp plugin install`; DEMO_MARKETPLACE, else this checkout), Tern's
// settings in Tern's own folder, a credential signed in through the plugin's own sign-in. Two
// things differ from a person's Mac: omp sends its model requests to the gateway the Mac running
// the machine lends (DEMO_GATEWAY_URL, vm/lend.ts), signed in nowhere here; and Tern isn't signed
// in, its sign-in sheet hidden instead (window.ts).
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import catalog from "../../catalog.json" with { type: "json" };
import {
	type Credential,
	DEMO_MODEL,
	run,
	type Sandbox,
	type SandboxOptions,
	ternBinary,
	writeOmpHome,
	writeTernSettings,
} from "./sandbox";

/** Made by the machine's image (vm/machine.pkr.hcl): only there does the recorder set up its user. */
const MARKER = "/etc/piebird-demo-machine";

type Env = Record<string, string | undefined>;

/** Whether the recorder runs in the demo machine. */
export function onDemoMachine(): boolean {
	return existsSync(MARKER);
}

/**
 * omp's models.yml: the demo model's provider sent to the lent gateway (`transport: pi-native`),
 * which answers with the sign-in of the Mac running the machine. The gateway takes no bearer; omp
 * calls a provider only with a key, so it gets a placeholder, and the provider counts as signed in
 * with a key, not a subscription (scenarios that care say so in their prompt).
 */
async function writeGatewayModels(home: string, url: string): Promise<void> {
	const provider = DEMO_MODEL.split("/")[0];
	const models = [
		"providers:",
		`  ${provider}:`,
		"    transport: pi-native",
		`    baseUrl: ${url}`,
		"    apiKey: none",
	];
	await writeFile(join(home, ".omp", "agent", "models.yml"), `${models.join("\n")}\n`);
}

/** The folder omp installed a plugin of the checkout's marketplace in. */
async function installPath(env: Env, name: string): Promise<string> {
	const listed: unknown = JSON.parse(await run(["omp", "plugin", "list", "--json"], env));
	const plugins: unknown = Reflect.get(Object(listed), "marketplace");
	const found: unknown = (Array.isArray(plugins) ? plugins : []).find(
		p => Reflect.get(Object(p), "id") === `${name}@${catalog.name}`,
	);
	const entries: unknown = Reflect.get(Object(found), "entries");
	const path: unknown = Array.isArray(entries) ? Reflect.get(Object(entries[0]), "installPath") : undefined;
	if (typeof path !== "string") throw new Error(`omp has no ${name} installed`);
	return path;
}

/** How each credential is signed in: as its plugin tells a person to, the secret pasted on stdin. */
const SIGN_IN: Record<Credential, (env: Env, secret: string) => Promise<void>> = {
	// The vault's sign-in from the plugin's folder (its README, "Signing in"); it keeps the session
	// in the machine's Keychain. `status` fails when Kagi didn't take it.
	kagi: async (env, link) => {
		const vault = join(await installPath(env, "piebird-kagi-search"), "native", "kagi-vault");
		await run([vault, "sign-in", "--link"], env, { stdin: `${link}\n` });
		await run([vault, "status"], env);
	},
};

/** How each credential is signed out again, so a clone kept (`--keep`) holds no session. */
const SIGN_OUT: Record<Credential, (env: Env) => Promise<void>> = {
	kagi: async env => {
		await run([join(await installPath(env, "piebird-kagi-search"), "native", "kagi-vault"), "sign-out"], env);
	},
};

/** The lent gateway's URL; throws unless this is the demo machine, set up to record `opts`. */
function machineGateway(opts: SandboxOptions): string {
	if (!onDemoMachine())
		throw new Error(`this isn't the demo machine (no ${MARKER}): record with tools/demo/vm/run.ts`);
	if (opts.agents?.length)
		throw new Error(
			"Claude Code and Codex aren't signed in in the demo machine: record this demo on this Mac (just demo-host)",
		);
	const gateway = process.env.DEMO_GATEWAY_URL;
	if (!gateway)
		throw new Error("DEMO_GATEWAY_URL isn't set: record with tools/demo/vm/run.ts, which lends the gateway");
	return gateway;
}

/** The demo machine's user set up for the demo; refuses to run anywhere else. */
export async function machineSandbox(opts: SandboxOptions): Promise<Sandbox> {
	const gateway = machineGateway(opts);
	const home = homedir();
	const root = await mkdtemp("/tmp/omp-demo-");
	const project = join(home, opts.projectName ?? "project");
	await mkdir(project, { recursive: true });
	const env = { ...process.env, PATH: `${dirname(ternBinary())}:${process.env.PATH ?? ""}` };
	const sandbox: Sandbox = {
		root,
		home,
		tern: join(home, "Library", "Application Support", "Tern"),
		project,
		controlSocket: join(root, "c.sock"),
		ternEnv: {},
		gate: "hidden",
		env,
		market: process.env.DEMO_MARKETPLACE ?? opts.market,
		installPlugin: async name => {
			await run(["omp", "plugin", "install", `${name}@${catalog.name}`], env);
		},
		close: async keep => {
			// Signed out whether the clone goes or stays: a clone kept for a look keeps no session.
			for (const name of opts.credentials ?? []) await SIGN_OUT[name](env);
			if (!keep) await rm(root, { recursive: true, force: true });
		},
	};
	await writeOmpHome(home, { rc: [], env: [] });
	await writeGatewayModels(home, gateway);
	await writeTernSettings(sandbox.tern, opts.ternSettings);
	await run(["omp", "plugin", "marketplace", "add", sandbox.market], env);
	for (const name of opts.plugins) await sandbox.installPlugin(name);
	for (const name of opts.credentials ?? []) {
		const secret = opts.secrets?.[name];
		if (!secret) throw new Error(`this demo needs ${name}, which the recorder wasn't given`);
		await SIGN_IN[name](env, secret);
	}
	return sandbox;
}
