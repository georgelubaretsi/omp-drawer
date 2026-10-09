export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ModelCost {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	longContext?: ModelCost;
}

export interface ModelCandidate {
	provider: string;
	id: string;
	name: string;
	cost: ModelCost;
	efforts: readonly string[];
}

export type BillingClass = "free" | "subscription" | "paid" | "unknown";

export interface RankedModel extends ModelCandidate {
	selector: string;
	billing: BillingClass;
	costScore: number;
}

export interface SelectionRequest {
	query: string;
	thinking?: ThinkingLevel;
	subscriptionProviders: readonly string[];
	approvedPaidSelectors: readonly string[];
	includePaidFallbacks: boolean;
}

export type SelectionResult =
	| { status: "ready"; models: RankedModel[] }
	| { status: "approval_required"; paid: RankedModel[]; availableWithoutPayment: RankedModel[] }
	| { status: "not_found"; reason: string };

export interface TemporaryAgentMetadata {
	name: string;
	sourceAgent: string;
	requestedModel: string;
	createdAt: string;
	role: string;
}
