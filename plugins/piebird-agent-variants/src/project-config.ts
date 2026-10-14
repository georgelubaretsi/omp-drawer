import { parseDocument } from "yaml";
import { model } from "../core/model.gen";
import { VariantError } from "../core/request";

export interface RouteUpdate {
	agentName: string;
	role: string;
	selectors: readonly string[];
	allowExisting: boolean;
}

export function configureTemporaryRoute(content: string | undefined, update: RouteUpdate): string {
	if (update.selectors.length === 0) throw new VariantError("no-selector", model.text("error-no-selector"));

	const document = parseDocument(content ?? "{}\n");
	if (document.errors.length > 0)
		throw new VariantError(
			"bad-config",
			model.text("error-bad-config", { error: document.errors[0]?.message ?? "" }),
		);

	const existing = document.getIn(["modelRoles", update.role]);
	if (existing !== undefined && !update.allowExisting)
		throw new VariantError("role-exists", model.text("error-role-exists", { role: update.role }));

	const agentOverride = document.getIn(["task", "agentModelOverrides", update.agentName]);
	if (agentOverride !== undefined)
		throw new VariantError(
			"persistent-override",
			model.text("error-persistent-override", { agent: update.agentName }),
		);

	document.setIn(["modelRoles", update.role], update.selectors[0]);
	const fallbacks = update.selectors.slice(1);
	if (fallbacks.length > 0) {
		document.setIn(["retry", "fallbackChains", update.role], fallbacks);
	} else if (update.allowExisting) {
		document.deleteIn(["retry", "fallbackChains", update.role]);
	}

	return content === undefined ? document.toString({ collectionStyle: "block" }) : document.toString();
}
