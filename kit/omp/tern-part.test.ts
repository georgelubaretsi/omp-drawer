// Keeping the Tern part in Tern: what to do for each state Tern can have it in, the install
// commands that follow, the notes shown, and when omp counts as a local pane. Tern itself is
// replaced by a scripted `run`.
import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decide, type Installed, isRemotePane, notice, type Run, type RunResult, syncPart } from "./tern-part";

const part = (fields: Partial<Installed> = {}): Installed => ({
	version: "1.0.0",
	status: "ready",
	linked: false,
	...fields,
});

describe("decide", () => {
	test("installs a missing part, replaces another version, keeps the same one", () => {
		expect(decide("1.0.0", undefined)).toBe("install");
		expect(decide("1.1.0", part())).toBe("replace");
		expect(decide("0.9.0", part())).toBe("replace");
		expect(decide("1.0.0", part())).toBe("none");
	});

	test("leaves a linked part and one turned off in Tern alone, whatever their version", () => {
		expect(decide("2.0.0", part({ linked: true }))).toBe("none");
		expect(decide("2.0.0", part({ status: "disabled" }))).toBe("none");
	});
});

/** A Tern with `plugins` listed (and `<id>.path` links in its plugins folder), recording calls; installs succeed unless `fail`. */
async function fakeTern(plugins: Record<string, Installed>, fail?: RunResult) {
	const dir = await mkdtemp(join(tmpdir(), "tern-part-test-"));
	await mkdir(join(dir, "plugins"));
	for (const [id, p] of Object.entries(plugins))
		if (p.linked) await writeFile(join(dir, "plugins", `${id}.path`), "/x");
	const calls: string[][] = [];
	const exec: Run = async argv => {
		calls.push(argv.slice(1));
		const [, verb] = argv.slice(1);
		if (verb === "dir") return { code: 0, stdout: `${join(dir, "plugins")}\n`, stderr: "" };
		if (verb === "list") {
			const list = Object.entries(plugins).map(([id, p]) => ({ id, version: p.version, status: p.status }));
			return { code: 0, stdout: JSON.stringify({ plugins: list }), stderr: "" };
		}
		return fail ?? { code: 0, stdout: "", stderr: "" };
	};
	const source = join(dir, "part");
	await mkdir(source);
	await writeFile(join(source, "plugin.toml"), 'schema = 1\nid = "demo"\nversion = "1.0.0"\nwindow = "window.luau"\n');
	return { calls, exec, source, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe("syncPart", () => {
	test("installs a missing part from its folder, without --force", async () => {
		const t = await fakeTern({});
		expect(await syncPart("tern", t.source, t.exec)).toEqual({ kind: "installed", version: "1.0.0" });
		expect(t.calls.filter(c => c[1] === "install")).toEqual([["plugin", "install", t.source]]);
		await t.cleanup();
	});

	test("replaces another version with --force", async () => {
		const t = await fakeTern({ demo: part({ version: "0.9.0" }) });
		expect(await syncPart("tern", t.source, t.exec)).toEqual({ kind: "updated", from: "0.9.0", to: "1.0.0" });
		expect(t.calls.filter(c => c[1] === "install")).toEqual([["plugin", "install", t.source, "--force"]]);
		await t.cleanup();
	});

	test("installs nothing for the same version, a link, or a part turned off", async () => {
		for (const installed of [part(), part({ version: "0.1.0", linked: true }), part({ status: "disabled" })]) {
			const t = await fakeTern({ demo: installed });
			expect(await syncPart("tern", t.source, t.exec)).toEqual({ kind: "unchanged" });
			expect(t.calls.some(c => c[1] === "install")).toBe(false);
			await t.cleanup();
		}
	});

	test("reports a failed install with the command to run by hand", async () => {
		const t = await fakeTern({}, { code: 1, stdout: "", stderr: "dir is not a plugin: bad\n" });
		expect(await syncPart("tern", t.source, t.exec)).toEqual({
			kind: "failed",
			error: "dir is not a plugin: bad",
			command: `tern plugin install "${t.source}" --force`,
		});
		await t.cleanup();
	});
});

describe("notice", () => {
	test("says nothing when nothing changed, and how to install by hand when installing failed", () => {
		expect(notice("demo", { kind: "unchanged" })).toBeUndefined();
		const failed = notice("demo", { kind: "failed", error: "Tern is too old", command: "tern plugin install x" });
		expect(failed).toContain("Tern is too old");
		expect(failed).toEndWith("tern plugin install x");
	});
});

describe("isRemotePane", () => {
	test("treats a local identity chain, or none, as local", () => {
		expect(isRemotePane('{"hops":[{"principal":"me","method":"local","from":"","host":"mac","user":"me"}]}')).toBe(
			false,
		);
		expect(isRemotePane(undefined)).toBe(false);
		expect(isRemotePane("not json")).toBe(false);
	});

	test("treats a chain with a non-local hop as remote", () => {
		expect(
			isRemotePane('{"hops":[{"principal":"me","method":"ssh-key","from":"laptop","host":"devbox","user":"me"}]}'),
		).toBe(true);
	});
});
