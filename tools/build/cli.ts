// `bun tools/build.ts [--check]`: writes the generated files, or with --check lists drift and exits 1.
import { ValidationError } from "./json";
import { build, check } from "./output";

/** Runs the build over `root` with command-line `args`; returns the exit code. */
export async function main(root: string, args: string[]): Promise<number> {
	const unknown = args.filter(a => a !== "--check");
	if (unknown.length > 0) {
		console.error(`usage: bun tools/build.ts [--check]  (unknown: ${unknown.join(" ")})`);
		return 2;
	}
	try {
		if (!args.includes("--check")) {
			const changed = await build(root);
			console.log(changed.length > 0 ? changed.join("\n") : "Generated files are up to date.");
			return 0;
		}
		const drift = await check(root);
		if (drift.length === 0) {
			console.log("Generated files are up to date.");
			return 0;
		}
		console.error(
			`Generated files are out of date; run \`bun tools/build.ts\` in plugins/:\n${drift.map(d => `  ${d}`).join("\n")}`,
		);
		return 1;
	} catch (e) {
		if (!(e instanceof ValidationError)) throw e;
		console.error(`Invalid plugin sources:\n${e.problems.map(p => `  ${p}`).join("\n")}`);
		return 1;
	}
}
