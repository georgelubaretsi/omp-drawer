// Generated from model.ftl by `bun run build`; edit model.ftl.
import { Catalog } from "../kit/core/model";

const SOURCE =
	"## The rules, for an agent with no rules of its own: the always-applied ones in full, the rest by name.\n\nrule = { $body }\nrules-on-demand = Read one of these rules when its description fits your work:\nrule-entry = - { $name }: { $description } ({ $file })\n";

export type Messages = {
	rule: {
		body: string | number;
	};
	"rule-entry": {
		description: string | number;
		file: string | number;
		name: string | number;
	};
	"rules-on-demand": undefined;
};

export const model = new Catalog<Messages>(SOURCE);
