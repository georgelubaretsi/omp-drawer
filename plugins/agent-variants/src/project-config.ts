import { parseDocument } from "yaml";
import { templates } from "./templates";

export interface RouteUpdate {
	agentName: string;
	role: string;
	selectors: readonly string[];
	allowExisting: boolean;
}

export function configureTemporaryRoute(content: string | undefined, update: RouteUpdate): string {
	const { errors } = templates;
	if (update.selectors.length === 0) throw new Error(errors.noSelector.render());

	const document = parseDocument(content ?? "{}\n");
	if (document.errors.length > 0) throw new Error(errors.badConfig.render({ error: document.errors[0]?.message }));

	const existing = document.getIn(["modelRoles", update.role]);
	if (existing !== undefined && !update.allowExisting)
		throw new Error(errors.roleExists.render({ role: update.role }));

	const agentOverride = document.getIn(["task", "agentModelOverrides", update.agentName]);
	if (agentOverride !== undefined) throw new Error(errors.persistentOverride.render({ agent: update.agentName }));

	document.setIn(["modelRoles", update.role], update.selectors[0]);
	const fallbacks = update.selectors.slice(1);
	if (fallbacks.length > 0) {
		document.setIn(["retry", "fallbackChains", update.role], fallbacks);
	} else if (update.allowExisting) {
		document.deleteIn(["retry", "fallbackChains", update.role]);
	}

	return content === undefined ? document.toString({ collectionStyle: "block" }) : document.toString();
}
