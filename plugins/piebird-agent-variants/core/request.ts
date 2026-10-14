// A setup call's arguments as the tool takes them (core/operations.json), with their defaults, and
// the variant's names: the source agent (task unless given), the agent's own name and its model
// role. A failure the model is told about carries one of the operation's declared errors.
import type { ModelText } from "../kit/core/model";
import type { ThinkingLevel } from "./domain";
import { THINKING_LEVELS } from "./domain";
import { model } from "./model.gen";

/** A declared error of the setup operation, in the catalog's words. */
export class VariantError extends Error {
	constructor(
		readonly id: string,
		readonly said: ModelText,
	) {
		super(said.text);
	}
}

export interface SetupRequest {
	readonly sourceAgent: string;
	readonly targetName: string;
	readonly role: string;
	readonly modelQuery: string;
	readonly thinking?: ThinkingLevel;
	readonly scope: "project" | "global";
	readonly subscriptionProviders: readonly string[];
	readonly approvedPaidSelectors: readonly string[];
	readonly includePaidFallbacks: boolean;
	readonly projectWriteApproved: boolean;
	readonly replaceTemporary: boolean;
}

type Fields = Readonly<Record<string, unknown>>;

const text = (f: Fields, key: string): string => {
	const value = f[key];
	return typeof value === "string" ? value.trim() : "";
};
const flag = (f: Fields, key: string): boolean => f[key] === true;
const texts = (f: Fields, key: string): string[] => {
	const value = f[key];
	return Array.isArray(value) ? value.filter(v => typeof v === "string") : [];
};

function isThinking(value: unknown): value is ThinkingLevel {
	return THINKING_LEVELS.some(level => level === value);
}

/** A model request as a name part: lowercase words joined by `-`. */
function slug(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return normalized || "model";
}

/** The request in a call's arguments; a target name with other characters is refused. */
export function readRequest(input: unknown): SetupRequest {
	const f: Fields = typeof input === "object" && input !== null ? { ...input } : {};
	const sourceAgent = text(f, "sourceAgent") || "task";
	const modelQuery = text(f, "modelQuery");
	const targetName = text(f, "targetName") || `tmp-${sourceAgent}-${slug(modelQuery)}`;
	if (!/^[A-Za-z0-9_-]+$/.test(targetName)) throw new VariantError("bad-name", model.text("error-bad-name"));
	const thinking = isThinking(f.thinking) ? f.thinking : undefined;
	return {
		sourceAgent,
		targetName,
		role: targetName.replace(/-/g, "_"),
		modelQuery,
		...(thinking === undefined ? {} : { thinking }),
		scope: f.scope === "global" ? "global" : "project",
		subscriptionProviders: texts(f, "subscriptionProviders"),
		approvedPaidSelectors: texts(f, "approvedPaidSelectors"),
		includePaidFallbacks: flag(f, "includePaidFallbacks"),
		projectWriteApproved: flag(f, "projectWriteApproved"),
		replaceTemporary: flag(f, "replaceTemporary"),
	};
}

/** Items joined by `joiner` in the catalog's words; "" for none. */
export function joined(items: readonly string[], joiner: "join-comma" | "join-arrow"): string {
	return items.length === 0 ? "" : items.reduce((a, b) => model.text(joiner, { a, b }).text);
}
