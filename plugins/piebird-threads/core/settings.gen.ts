// Generated from settings.json by `bun run build`; edit settings.json.
import { parseDeclared } from "../kit/core/declared";

const SOURCE =
	'{"settings":{"folder":{"type":"path","title":"Threads folder","about":"The folder of the project\'s open threads, one .md file each: relative to the project, or absolute. Empty: the folder the project\'s .omp/threads.json names, if any.","default":""}}}';

export const declared = parseDeclared(SOURCE);
