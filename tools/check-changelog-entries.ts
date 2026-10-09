#!/usr/bin/env bun
// `bun tools/check-changelog-entries.ts [--opted-out] <changes> <paths> <parent dir> <staged dir>`:
// the commit-msg check that each changed thing keeps its changelog and gets an entry there;
// tools/check-changelog-entries.sh writes its inputs from the index and HEAD. Modules: changelog/.
import { checkEntries } from "./changelog/cli";

process.exit(await checkEntries(process.argv.slice(2)));
