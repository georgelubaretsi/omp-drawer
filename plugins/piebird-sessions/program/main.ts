// piebird-sessions's program, for Codex and the desktop apps (parts.ts).
import { runProgram } from "../kit/program/cli";
import { NAME, parts } from "./parts";

await runProgram(process.argv.slice(2), { name: NAME, parts: async () => parts() });
