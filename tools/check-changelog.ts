#!/usr/bin/env bun
// `bun tools/check-changelog.ts <file>...`: each file is a changelog in Keep a Changelog format
// (keep-a-changelog parses it) with an Unreleased section. Prints every problem and exits 1 when
// there are any. The build checks each plugin's changelog itself, with its version; this is for
// the others (tools/lint.sh runs it on every tracked CHANGELOG.md). Modules: changelog/.
import { checkFiles } from "./changelog/cli";

process.exit(await checkFiles(process.argv.slice(2)));
