#!/usr/bin/env bun
// Generates every host-specific manifest from the hand-written sources: catalog.json,
// plugins/<name>/plugin.json (Agent Plugins 1.0) and optional plugins/<name>/mcp.json; and the
// plugins' copies of the kit (kit/). Native programs (cmd/<program>/) are compiled by
// tools/native.ts, not here.
// `bun tools/build.ts` writes the generated files; `--check` only compares them and exits 1
// listing every missing, differing, non-executable or unexpected file. Run from anywhere; paths
// are relative to this folder. The modules are in build/.
import { join } from "node:path";
import { main } from "./build/cli";

process.exit(await main(join(import.meta.dir, ".."), process.argv.slice(2)));
