// What a vendor.json may name: sources inside the package, copies in a vendor/ folder of the
// plugin or kit part, never a path that leaves either.
import { afterEach, expect, test } from "bun:test";
import { cleanup, put, tree } from "./fixtures";
import { ValidationError } from "./json";
import { vendorFiles } from "./vendor";

afterEach(cleanup);

async function problems(declared: unknown): Promise<string[]> {
	const root = await tree(["omp"]);
	await put(root, "plugins/demo/vendor.json", declared);
	try {
		await vendorFiles(root);
		return [];
	} catch (error) {
		if (error instanceof ValidationError) return error.problems;
		throw error;
	}
}

test("a plugin's library is copied from its package into its vendor/ folder", async () => {
	const root = await tree(["omp"]);
	await put(root, "plugins/demo/vendor.json", { yaml: { from: "browser/dist", to: "vendor/yaml", license: "ISC" } });
	const { files, dirs } = await vendorFiles(root);
	expect(dirs).toContain("plugins/demo/vendor/yaml");
	expect(files.has("plugins/demo/vendor/yaml/index.js")).toBe(true);
	expect(files.has("plugins/demo/vendor/yaml/LICENSE")).toBe(true);
});

test("a source outside the package, or a copy outside a vendor/ folder, is refused", async () => {
	const cases: [Record<string, unknown>, string][] = [
		[{ from: "../../other-package", to: "vendor/yaml" }, "/yaml/from leaves the package"],
		[{ from: "dist", types: "../x", to: "vendor/yaml" }, "/yaml/types leaves the package"],
		[{ from: "dist", to: "../../../outside" }, "/yaml/to must be a folder under a vendor/ folder"],
		[{ from: "dist", to: "." }, "/yaml/to must be a folder under a vendor/ folder"],
		[{ from: "dist", to: "src" }, "/yaml/to must be a folder under a vendor/ folder"],
		[{ from: "dist", to: "vendor" }, "/yaml/to must be a folder under a vendor/ folder"],
		// Windows takes `\` as a separator too: this is src/ there.
		[{ from: "dist", to: "vendor/x\\..\\..\\src" }, "/yaml/to must be a folder under a vendor/ folder"],
	];
	for (const [paths, problem] of cases) {
		expect(await problems({ yaml: { ...paths, license: "ISC" } })).toEqual([`plugins/demo/vendor.json: ${problem}`]);
	}
	expect(await problems({ "../../evil": { from: "dist", to: "vendor/x", license: "MIT" } })).toEqual([
		"plugins/demo/vendor.json: /../../evil names no package in node_modules",
	]);
});
