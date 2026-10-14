// Generated from operations.json by `bun run build`; edit operations.json.
import type { ModelText } from "../kit/core/model";
import { parseOperations } from "../kit/core/operations";
import { model } from "./model.gen";

const SOURCE =
	'{"operations":{"setup":{"input":{"type":"object","properties":{"sourceAgent":{"type":"string"},"modelQuery":{"type":"string"},"thinking":{"type":"string","enum":["off","minimal","low","medium","high","xhigh","max"]},"targetName":{"type":"string"},"scope":{"type":"string","enum":["project","global"]},"subscriptionProviders":{"type":"array","items":{"type":"string"}},"approvedPaidSelectors":{"type":"array","items":{"type":"string"}},"includePaidFallbacks":{"type":"boolean"},"projectWriteApproved":{"type":"boolean"},"replaceTemporary":{"type":"boolean"}},"required":["modelQuery"],"additionalProperties":false},"output":{"type":"object","properties":{"status":{"type":"string","enum":["configured","approval_required","blocked"]},"agent":{"type":"string"},"role":{"type":"string"},"path":{"type":"string"},"models":{"type":"array","items":{"type":"string"}},"paid":{"type":"array","items":{"type":"object","properties":{"selector":{"type":"string"},"input":{"type":"number"},"output":{"type":"number"},"cacheRead":{"type":"number"},"cacheWrite":{"type":"number"}}}}},"required":["status"]},"errors":["agent-not-found","bad-config","bad-frontmatter","bad-name","config-path","exists","export-failed","git-status","missing-field","no-frontmatter","no-model","no-selector","not-temporary","other-variant","persistent-override","role-exists","uncommitted"],"tool":{"name":"agent_variant_setup","alwaysLoad":true}}}}';

const text = new Map<string, ModelText>();
text.set("setup", model.text("setup"));
text.set("setup.approvedPaidSelectors", model.text("setup.approvedPaidSelectors"));
text.set("setup.includePaidFallbacks", model.text("setup.includePaidFallbacks"));
text.set("setup.modelQuery", model.text("setup.modelQuery"));
text.set("setup.projectWriteApproved", model.text("setup.projectWriteApproved"));
text.set("setup.replaceTemporary", model.text("setup.replaceTemporary"));
text.set("setup.scope", model.text("setup.scope"));
text.set("setup.sourceAgent", model.text("setup.sourceAgent"));
text.set("setup.subscriptionProviders", model.text("setup.subscriptionProviders"));
text.set("setup.targetName", model.text("setup.targetName"));
text.set("setup.thinking", model.text("setup.thinking"));

export const operations = parseOperations(SOURCE, text);
