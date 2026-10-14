#!/usr/bin/env bun
// `bun tools/check-changelog-entries.ts [--opted-out] [--touched <changelog> <time>]... <changes>
// <paths> <parent paths> <parent dir> <staged dir>`: the commit-msg check that each changed thing
// keeps its changelog and gets an entry there; the workspace's tools/check-changelog-entries.ts
// writes its inputs from the index and HEAD. Modules: changelog/.
import { checkEntries } from "./changelog/cli";

process.exit(await checkEntries(process.argv.slice(2)));
