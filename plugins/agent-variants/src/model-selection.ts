import type { BillingClass, ModelCandidate, ModelCost, RankedModel, SelectionRequest, SelectionResult } from "./domain";

function normalize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function selector(model: ModelCandidate): string {
	return `${model.provider}/${model.id}`;
}

function queryMatches(model: ModelCandidate, query: string): boolean {
	const exact = query.trim().toLowerCase();
	if (exact.includes("/") && selector(model).toLowerCase() === exact) return true;

	const tokens = normalize(query).split(" ").filter(Boolean);
	if (tokens.length === 0) return false;
	const haystack = normalize(`${model.provider} ${model.id} ${model.name}`);
	return tokens.every(token => haystack.includes(token));
}

function supportsThinking(model: ModelCandidate, thinking: string | undefined): boolean {
	if (!thinking || thinking === "off") return true;
	return model.efforts.includes(thinking);
}

function costValues(cost: ModelCost): number[] {
	const values = [cost.input, cost.output, cost.cacheRead, cost.cacheWrite];
	return cost.longContext ? values.concat(costValues(cost.longContext)) : values;
}

function hasKnownCost(cost: ModelCost): boolean {
	return costValues(cost).every(value => Number.isFinite(value) && value >= 0);
}

function isFree(cost: ModelCost): boolean {
	return hasKnownCost(cost) && costValues(cost).every(value => value === 0);
}

function costScore(cost: ModelCost): number {
	if (!hasKnownCost(cost)) return Number.POSITIVE_INFINITY;
	return costValues(cost).reduce((sum, value) => sum + value, 0);
}

function classify(model: ModelCandidate, subscriptions: ReadonlySet<string>): BillingClass {
	if (isFree(model.cost)) return "free";
	if (subscriptions.has(model.provider.toLowerCase())) return "subscription";
	return hasKnownCost(model.cost) ? "paid" : "unknown";
}

function rank(model: ModelCandidate, subscriptions: ReadonlySet<string>): RankedModel {
	return {
		...model,
		selector: selector(model),
		billing: classify(model, subscriptions),
		costScore: costScore(model.cost),
	};
}

function compareFree(left: RankedModel, right: RankedModel): number {
	const leftExplicit = /(^|[-_/])free($|[-_/])/.test(left.selector.toLowerCase()) ? 0 : 1;
	const rightExplicit = /(^|[-_/])free($|[-_/])/.test(right.selector.toLowerCase()) ? 0 : 1;
	return leftExplicit - rightExplicit || left.selector.localeCompare(right.selector);
}

function compareSubscription(
	providerOrder: ReadonlyMap<string, number>,
): (left: RankedModel, right: RankedModel) => number {
	return (left, right) => {
		const leftRank = providerOrder.get(left.provider.toLowerCase()) ?? Number.POSITIVE_INFINITY;
		const rightRank = providerOrder.get(right.provider.toLowerCase()) ?? Number.POSITIVE_INFINITY;
		return leftRank - rightRank || left.selector.localeCompare(right.selector);
	};
}

function comparePaid(left: RankedModel, right: RankedModel): number {
	return left.costScore - right.costScore || left.selector.localeCompare(right.selector);
}

export function selectModels(models: readonly ModelCandidate[], request: SelectionRequest): SelectionResult {
	const subscriptions = new Set(request.subscriptionProviders.map(provider => provider.toLowerCase()));
	const providerOrder = new Map(
		request.subscriptionProviders.map((provider, index) => [provider.toLowerCase(), index]),
	);
	const approved = new Set(request.approvedPaidSelectors.map(value => value.toLowerCase()));

	const matches = models
		.filter(model => queryMatches(model, request.query))
		.filter(model => supportsThinking(model, request.thinking))
		.map(model => rank(model, subscriptions));

	if (matches.length === 0) {
		const suffix = request.thinking ? ` with ${request.thinking} thinking` : "";
		return { status: "not_found", reason: `No authenticated model matches “${request.query}”${suffix}.` };
	}

	const free = matches.filter(model => model.billing === "free").toSorted(compareFree);
	const subscription = matches
		.filter(model => model.billing === "subscription")
		.toSorted(compareSubscription(providerOrder));
	const paid = matches.filter(model => model.billing === "paid" || model.billing === "unknown").toSorted(comparePaid);
	const approvedPaid = paid.filter(model => approved.has(model.selector.toLowerCase()));
	const unapprovedPaid = paid.filter(model => !approved.has(model.selector.toLowerCase()));
	const availableWithoutPayment = [...free, ...subscription];

	if (request.includePaidFallbacks && unapprovedPaid.length > 0) {
		return { status: "approval_required", paid: unapprovedPaid, availableWithoutPayment };
	}
	if (availableWithoutPayment.length === 0 && approvedPaid.length === 0) {
		return { status: "approval_required", paid: unapprovedPaid, availableWithoutPayment: [] };
	}

	return { status: "ready", models: [...availableWithoutPayment, ...approvedPaid] };
}
