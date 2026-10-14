// piebird-kagi-search's program, for Codex and the desktop apps (parts.ts).
import { join } from "node:path";
import { declared } from "../core/settings.gen";
import { bunIo } from "../kit/bun/io";
import { programPlace } from "../kit/program/io";
import { runProgram } from "../kit/program/cli";
import { cacheFolder, failureMarks } from "./marks";
import { kagiParts, NAME } from "./parts";

const place = programPlace();
const marks = failureMarks(
	join(cacheFolder(place.home, process.env, process.platform), "piebird", NAME, "kagi-failed"),
);
const surroundings = { io: bunIo(), place, windows: process.platform === "win32", marks };

await runProgram(process.argv.slice(2), {
	name: NAME,
	parts: agent => kagiParts(agent, surroundings),
	settings: declared,
});
