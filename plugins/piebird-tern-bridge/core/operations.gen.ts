// Generated from operations.json by `bun run build`; edit operations.json.
import type { ModelText } from "../kit/core/model";
import { parseOperations } from "../kit/core/operations";
import { model } from "./model.gen";

const SOURCE =
	'{"operations":{"lua":{"input":{"type":"object","properties":{"code":{"type":"string"},"timeout_s":{"type":"number"}},"required":["code"],"additionalProperties":false},"output":{"type":"object","properties":{"pane":{"type":"integer"},"ok":{"type":"boolean"}},"required":["pane","ok"]},"errors":["lua-error","cancelled","not-loaded","unclaimed","unknown","too-large"],"tool":{"name":"tern_lua","alwaysLoad":true,"runsCode":true}}}}';

const text = new Map<string, ModelText>();
text.set("lua", model.text("lua"));
text.set("lua.code", model.text("lua.code"));
text.set("lua.timeout_s", model.text("lua.timeout_s"));

export const operations = parseOperations(SOURCE, text);
