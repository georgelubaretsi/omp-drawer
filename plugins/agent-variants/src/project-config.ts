import { parseDocument } from "yaml";

export interface RouteUpdate {
	agentName: string;
	role: string;
	selectors: readonly string[];
	allowExisting: boolean;
}

export function configureTemporaryRoute(content: string | undefined, update: RouteUpdate): string {
	if (update.selectors.length === 0) throw new Error("A temporary route requires at least one model selector.");

	const document = parseDocument(content ?? "{}\n");
	if (document.errors.length > 0) throw new Error(`Invalid .omp/config.yml: ${document.errors[0]?.message}`);

	const existing = document.getIn(["modelRoles", update.role]);
	if (existing !== undefined && !update.allowExisting) {
		throw new Error(`Model role ${update.role} already exists.`);
	}

	const agentOverride = document.getIn(["task", "agentModelOverrides", update.agentName]);
	if (agentOverride !== undefined) {
		throw new Error(
			`Agent ${update.agentName} has a persistent model override that would bypass its temporary role.`,
		);
	}

	document.setIn(["modelRoles", update.role], update.selectors[0]);
	const fallbacks = update.selectors.slice(1);
	if (fallbacks.length > 0) {
		document.setIn(["retry", "fallbackChains", update.role], fallbacks);
	} else if (update.allowExisting) {
		document.deleteIn(["retry", "fallbackChains", update.role]);
	}

	return content === undefined ? document.toString({ collectionStyle: "block" }) : document.toString();
}
