// Generated from operations.json by `bun run build`; edit operations.json.
import type { ModelText } from "../kit/core/model";
import { parseOperations } from "../kit/core/operations";
import { model } from "./model.gen";

const SOURCE =
	'{"operations":{"read":{"input":{"type":"object","properties":{"session":{"type":"string"},"line":{"type":"integer","minimum":1},"before":{"type":"integer","minimum":1},"after":{"type":"integer","minimum":1},"find":{"type":"string"},"user":{"type":"boolean"},"thinking":{"type":"boolean"},"tools":{"type":"boolean"},"raw":{"type":"boolean"}},"additionalProperties":false},"output":{"type":"object"},"errors":["not-found","ambiguous","past-end","before-without-line","find-with-page","list-with-params","user-with-details","bad-argument"],"tool":{"name":"session_read","readOnly":true,"alwaysLoad":true}}}}';

const text = new Map<string, ModelText>();
text.set("read", model.text("read"));
text.set("read.after", model.text("read.after"));
text.set("read.before", model.text("read.before"));
text.set("read.find", model.text("read.find"));
text.set("read.line", model.text("read.line"));
text.set("read.raw", model.text("read.raw"));
text.set("read.session", model.text("read.session"));
text.set("read.thinking", model.text("read.thinking"));
text.set("read.tools", model.text("read.tools"));
text.set("read.user", model.text("read.user"));

export const operations = parseOperations(SOURCE, text);
