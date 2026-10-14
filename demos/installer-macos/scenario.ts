// The desktop installer on a Mac that has ChatGPT and Claude (signed out, as just installed):
// open it, install the plugins, add one to Claude chat, then choose a setting. Places are points
// on the base image's 1024×768 screen, where Safari and Claude open their windows the same way
// every time; record again after changing the page or the image.
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { VmDemo } from "../../tools/demo/vm/director";
import type { Guest } from "../../tools/demo/vm/guest";
import type { VmScenario } from "../../tools/demo/vm/record";
import { buildInstaller } from "../../tools/installer";
import { linkProblems } from "../../tools/native";

const PLUGINS = join(import.meta.dir, "..", "..");

/** An app's download from its Homebrew cask, kept on this computer between runs and checked. */
async function download(cask: string): Promise<string> {
	const info: unknown = await (await fetch(`https://formulae.brew.sh/api/cask/${cask}.json`)).json();
	const url = info && typeof info === "object" && "url" in info && typeof info.url === "string" ? info.url : "";
	const sha =
		info && typeof info === "object" && "sha256" in info && typeof info.sha256 === "string" ? info.sha256 : "";
	const dir = join(tmpdir(), "piebird-demo-apps");
	mkdirSync(dir, { recursive: true });
	const file = join(dir, basename(new URL(url).pathname));
	if (!existsSync(file)) await Bun.write(file, await fetch(url));
	const got = new Bun.CryptoHasher("sha256").update(await Bun.file(file).bytes()).digest("hex");
	if (got !== sha) throw new Error(`${file} isn't the ${cask} cask's download (sha256 ${got})`);
	return file;
}

async function setup(guest: Guest): Promise<void> {
	// Programs built by a Bun other than Bun's own (the dev shell's) don't run on a clean Mac.
	const own = [process.execPath, join(PLUGINS, "plugins/piebird-kagi-search/native/macos-arm64/piebird-kagi-search")];
	const problems = await linkProblems(own);
	if (problems.length > 0)
		throw new Error(`run this, and tools/native.ts before it, with Bun's official build:\n${problems.join("\n")}`);
	const dmg = await buildInstaller("macos-arm64", join(tmpdir(), "piebird-demo-installer"), false);
	await guest.sudo("networksetup -setdnsservers Ethernet 1.1.1.1 8.8.8.8; pmset -a displaysleep 0 sleep 0");
	for (const cask of ["chatgpt", "claude"]) {
		const zip = await download(cask);
		guest.copy(zip, "/tmp/app.zip");
		await guest.shell("ditto -x -k /tmp/app.zip /Applications && rm /tmp/app.zip");
	}
	guest.copy(dmg, "Downloads/");
	// The desktop's widgets show where this computer is (the weather widget); a demo shows no place.
	await guest.shell(
		"defaults write com.apple.WindowManager StandardHideWidgets -int 1; killall WindowManager; sleep 3; true",
	);
	// Dark, as every demo. macOS takes the appearance when the user logs in (System Events, which
	// switches it live, waits for a permission no one is there to give): write it, then end the
	// login session; the image logs its user back in by itself.
	await guest.shell("defaults write -g AppleInterfaceStyle Dark");
	await guest.sudo("pkill -x loginwindow; true");
	await guest.shell(
		"sleep 5; for i in $(seq 1 90); do pgrep -x Dock >/dev/null && pgrep -x Finder >/dev/null && break; sleep 1; done; sleep 8",
	);
	await guest.shell("pkill -x Terminal; open ~/Downloads; sleep 3");
}

const BLUE: [number, number, number] = [0, 113, 227];
/** The install button while it works: #0071e3 at half opacity over the dark page (#1d1d1f). */
const PALE_BLUE: [number, number, number] = [15, 71, 129];
/** Claude's Install button in its extension window, white in dark mode. */
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * Claude runs python3 at its start, and on a Mac without Apple's developer tools that asks to
 * install them: not part of the demo, so the prompt is closed whenever it shows.
 */
function dismissDeveloperTools(guest: Guest): () => void {
	const stop = new AbortController();
	void (async () => {
		while (!stop.signal.aborted) {
			await guest.shell("pkill -f 'Command Line Developer Tools' || true").catch(() => "");
			await Bun.sleep(1500);
		}
	})();
	return () => stop.abort();
}

async function install(d: VmDemo): Promise<void> {
	d.caption("Download the piebird installer and open it");
	await d.wait(2500);
	await d.guest.shell("open ~/Downloads/piebird-*.dmg");
	await d.settle();
	await d.guest.shell("open '/Volumes/Install piebird/Install piebird.app'");
	await d.waitForColor(190, 670, BLUE);
	await d.shot("1-page");
	d.caption("It finds ChatGPT and Claude", "and lists the plugins for them");
	await d.wait(3500);
	d.caption("One click installs each plugin in every app that takes it");
	await d.click(226, 670);
	await d.waitForColor(190, 670, PALE_BLUE, 10_000);
	await d.waitForColor(190, 670, BLUE);
	await d.shot("2-installed");
	await d.wait(3000);
}

async function claudeChat(d: VmDemo): Promise<void> {
	d.caption("Claude chat adds a plugin in its own window");
	await d.click(296, 535);
	await d.waitForColor(258, 282, WHITE);
	await d.shot("3-claude");
	await d.click(300, 282);
	await d.wait(1500);
	await d.shot("4-confirm");
	await d.click(570, 385);
	await d.wait(3000);
	await d.shot("5-added");
	await d.click(764, 78);
	await d.wait(800);
	await d.click(236, 54);
	await d.wait(800);
	await d.shot("6-closed");
}

async function settings(d: VmDemo): Promise<void> {
	d.caption("Settings, for every app at once");
	await d.click(262, 600);
	await d.click(262, 600);
	await d.waitForColor(165, 670, BLUE);
	await d.shot("7-settings");
	// "Kagi only", the first choice below "Automatic".
	await d.click(171, 460);
	await d.wait(1000);
	await d.click(202, 670);
	await d.wait(2500);
	await d.shot("8-saved");
	d.caption("Saved: every app reads it");
	await d.wait(3000);
}

async function run(d: VmDemo): Promise<void> {
	const stop = dismissDeveloperTools(d.guest);
	try {
		await install(d);
		await claudeChat(d);
		await settings(d);
	} finally {
		stop();
	}
}

const scenario: VmScenario = { base: "ghcr.io/cirruslabs/macos-tahoe-vanilla:latest", setup, run };
export default scenario;
