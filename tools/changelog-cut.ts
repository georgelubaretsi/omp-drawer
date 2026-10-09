#!/usr/bin/env bun
// `bun tools/changelog-cut.ts [<file>...]`: moves a never-released changelog's Unreleased entries
// into the section of the month they were last changed in, once that month is over; by default
// the monthly changelogs, named from the workspace root. Modules: changelog/ (cut.ts).
import { cutFiles } from "./changelog/cut";

process.exit(await cutFiles(process.argv.slice(2)));
