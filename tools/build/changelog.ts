// The workspace's own rule: every plugin keeps a CHANGELOG.md, named exactly that, in Keep a
// Changelog 2.0.0 format with one Unreleased section, and once it has a release, the newest one has
// plugin.json's version, headings read as the parser reads them (../changelog/check.ts).
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { changelogProblems } from "../changelog/check";
import { hasExactly, type PluginDir } from "./paths";

/** Checks plugin `dir`'s changelog, whose listing is `names`, against plugin.json's `version`. */
export async function checkChangelog(dir: PluginDir, names: string[], version: unknown, problems: string[]) {
	const rel = `${dir.base}/CHANGELOG.md`;
	if (!hasExactly(names, "CHANGELOG.md", dir.base, problems)) {
		problems.push(`${rel}: missing; every plugin keeps one (Keep a Changelog 2.0.0, with ## [Unreleased])`);
		return;
	}
	const path = join(dir.path, "CHANGELOG.md");
	if (!(await lstat(path)).isFile()) {
		problems.push(`${rel}: must be a regular file`);
		return;
	}
	const declared = typeof version === "string" ? version : undefined;
	problems.push(...changelogProblems(rel, await readFile(path, "utf8"), { version: declared }));
}
