import { join, relative } from "node:path";
import type { AgentToolResult, ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { createAgentVariant, readTemporaryAgent } from "./agent-definition";
import { THINKING_LEVELS, type ModelCandidate, type RankedModel, type ThinkingLevel } from "./domain";
import { selectModels } from "./model-selection";
import { configureTemporaryRoute } from "./project-config";
import {
	loadSourceAgent,
	readExisting,
	resolveScopePaths,
	scanTemporaryAgents,
	writeVariantTransaction,
	type ExecuteCommand,
	type ScopePaths,
} from "./storage";

interface ToolDetails {
	status: "configured" | "approval_required" | "blocked";
	agent?: string;
	role?: string;
	path?: string;
	models?: string[];
	paid?: Array<{ selector: string; input: number; output: number; cacheRead: number; cacheWrite: number }>;
}

type ToolResult = AgentToolResult<ToolDetails>;

interface VariantNames {
	sourceAgent: string;
	targetName: string;
	role: string;
}

interface VariantRequest extends VariantNames {
	scope: "project" | "global";
	cwd: string;
	modelQuery: string;
	thinking?: ThinkingLevel;
	replaceTemporary: boolean;
	models: readonly RankedModel[];
	execute: ExecuteCommand;
}

const TOOL_DESCRIPTION =
	"Set up a temporary OMP agent variant when the user asks to launch, run, or delegate work with a particular model, provider, cost constraint, or reasoning level. Infer the source agent from intent: designer for UI/UX, reviewer for correctness review, security-reviewer for security, librarian for external research, scout for repository exploration, sonic only for explicitly mechanical work, otherwise task. This tool configures the variant but does not launch it. Project scope is mandatory unless the user explicitly requests global scope. Never claim project-write approval unless repository instructions were checked. Paid per-token selectors require explicit user approval.";

function slug(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return normalized || "model";
}

function formatPaidOption(model: RankedModel): string {
	const cost = model.cost;
	return `${model.selector}: input ${cost.input}, output ${cost.output}, cache read ${cost.cacheRead}, cache write ${cost.cacheWrite}`;
}

function textResult(text: string, details: ToolDetails): ToolResult {
	return { content: [{ type: "text", text }], details };
}

function buildParameters(z: ExtensionAPI["zod"]) {
	return z.object({
		sourceAgent: z
			.string()
			.optional()
			.describe("Existing OMP agent behavior to preserve; omit only for generic task work."),
		modelQuery: z.string().describe("Natural model request or exact selector, such as Kimi K3 or ox-alpha."),
		thinking: z
			.enum(THINKING_LEVELS)
			.optional()
			.describe("Requested thinking level; omit to preserve source-agent behavior."),
		targetName: z.string().optional().describe("Optional temporary agent name."),
		scope: z.enum(["project", "global"]).default("project"),
		subscriptionProviders: z
			.array(z.string())
			.optional()
			.describe("Provider ids the user explicitly identified as subscription-backed."),
		approvedPaidSelectors: z
			.array(z.string())
			.optional()
			.describe("Exact paid selectors explicitly approved by the user for this setup."),
		includePaidFallbacks: z
			.boolean()
			.default(false)
			.describe("Whether the user requested paid fallbacks in addition to free/subscription routes."),
		projectWriteApproved: z
			.boolean()
			.default(false)
			.describe("True only after repository instructions and status permit the target .omp writes."),
		replaceTemporary: z.boolean().default(false).describe("Update an existing temporary variant with the same name."),
	});
}

function variantNames(params: { sourceAgent?: string; targetName?: string; modelQuery: string }): VariantNames {
	const sourceAgent = params.sourceAgent?.trim() || "task";
	const targetName = params.targetName?.trim() || `tmp-${sourceAgent}-${slug(params.modelQuery)}`;
	if (!/^[A-Za-z0-9_-]+$/.test(targetName)) {
		throw new Error("Temporary agent names may contain only letters, numbers, underscores, and hyphens.");
	}
	return { sourceAgent, targetName, role: targetName.replace(/-/g, "_") };
}

function runtimeModels(ctx: ExtensionContext): ModelCandidate[] {
	return ctx.models.list().map(model => ({
		provider: model.provider,
		id: model.id,
		name: model.name,
		cost: model.cost,
		efforts: model.thinking?.efforts ?? [],
	}));
}

function approvalResult(
	paidModels: readonly RankedModel[],
	availableWithoutPayment: readonly RankedModel[],
): ToolResult {
	const paid = paidModels.map(model => ({
		selector: model.selector,
		input: model.cost.input,
		output: model.cost.output,
		cacheRead: model.cost.cacheRead,
		cacheWrite: model.cost.cacheWrite,
	}));
	const available = availableWithoutPayment.map(model => model.selector);
	const prefix = available.length > 0 ? `Free/subscription routes available: ${available.join(", ")}. ` : "";
	return textResult(
		`${prefix}Explicit approval is required before configuring paid per-token routes:\n${paidModels.map(formatPaidOption).join("\n")}`,
		{ status: "approval_required", paid },
	);
}

// Returns whether an existing temporary variant may be replaced.
async function checkExistingAgent(agentPath: string, request: VariantRequest): Promise<boolean> {
	const existingAgent = await readExisting(agentPath);
	if (existingAgent === undefined) return false;
	const metadata = readTemporaryAgent(existingAgent);
	if (!metadata) throw new Error(`${agentPath} already exists and is not a temporary agent variant.`);
	if (!request.replaceTemporary) {
		throw new Error(
			`${request.targetName} already exists. Set replaceTemporary only after the user requests an update.`,
		);
	}
	if (metadata.sourceAgent !== request.sourceAgent || metadata.role !== request.role) {
		throw new Error(`${request.targetName} belongs to a different temporary source or role.`);
	}
	return true;
}

async function ensureCleanTargets(paths: ScopePaths, agentPath: string, execute: ExecuteCommand): Promise<void> {
	const configRelative = relative(paths.root, paths.configPath);
	const agentRelative = relative(paths.root, agentPath);
	const status = await execute("git", ["status", "--short", "--", configRelative, agentRelative], {
		cwd: paths.root,
		timeout: 10_000,
	});
	if (status.code === 0 && status.stdout.trim().length > 0) {
		throw new Error(`Target OMP configuration has uncommitted changes; refusing to overwrite user work.`);
	}
}

async function configureVariant(request: VariantRequest): Promise<ToolResult> {
	const { sourceAgent, targetName, role, execute } = request;
	const paths = await resolveScopePaths(request.cwd, request.scope, execute);
	const agentPath = join(paths.agentsDir, `${targetName}.md`);
	const allowExisting = await checkExistingAgent(agentPath, request);
	if (request.scope === "project") await ensureCleanTargets(paths, agentPath, execute);

	const source = await loadSourceAgent(sourceAgent, request.cwd, execute);
	const selectors = request.models.map(model => model.selector);
	const configBefore = await readExisting(paths.configPath);
	const configContent = configureTemporaryRoute(configBefore, {
		agentName: targetName,
		role,
		selectors,
		allowExisting,
	});
	const agentContent = createAgentVariant(source, {
		name: targetName,
		role,
		requestedModel: request.modelQuery,
		createdAt: new Date().toISOString(),
		thinking: request.thinking,
	});
	await writeVariantTransaction({ agentPath, agentContent, configPath: paths.configPath, configContent });

	return textResult(
		`Configured temporary ${sourceAgent} variant ${targetName} using ${selectors.join(" → ")}. Use agent “${targetName}” for the user's original request.`,
		{ status: "configured", agent: targetName, role, path: agentPath, models: selectors },
	);
}

export default function agentVariantsExtension(pi: ExtensionAPI) {
	pi.setLabel("Agent Variants");

	pi.on("session_start", async (_event, ctx) => {
		const temporary = await scanTemporaryAgents(ctx.cwd);
		if (temporary.length === 0) return;
		const lines = temporary.map(agent => `${agent.name} — from ${agent.sourceAgent} — ${agent.requestedModel}`);
		ctx.setTimeout(() => {
			ctx.ui.notify(`Temporary OMP agents in this project:\n${lines.join("\n")}`, "info");
		}, 500);
	});

	const parameters = buildParameters(pi.zod);
	pi.registerTool<typeof parameters, ToolDetails>({
		name: "agent_variant_setup",
		label: "Set Up Agent Variant",
		description: TOOL_DESCRIPTION,
		approval: "write",
		loadMode: "essential",
		parameters,
		// oxlint-disable-next-line eslint/max-params -- the host's tool API fixes these five positional parameters
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const scope = params.scope ?? "project";
			if (scope === "project" && !params.projectWriteApproved) {
				return textResult(
					"Project write not approved. Check repository instructions and status before creating .omp agent configuration.",
					{ status: "blocked" },
				);
			}

			const names = variantNames(params);
			const selection = selectModels(runtimeModels(ctx), {
				query: params.modelQuery,
				thinking: params.thinking,
				subscriptionProviders: params.subscriptionProviders ?? [],
				approvedPaidSelectors: params.approvedPaidSelectors ?? [],
				includePaidFallbacks: params.includePaidFallbacks ?? false,
			});
			if (selection.status === "not_found") throw new Error(selection.reason);
			if (selection.status === "approval_required") {
				return approvalResult(selection.paid, selection.availableWithoutPayment);
			}

			const execute: ExecuteCommand = (command, args, options) =>
				pi.exec(command, args, { ...options, signal: options?.signal ?? signal });
			return configureVariant({
				...names,
				scope,
				cwd: ctx.cwd,
				modelQuery: params.modelQuery,
				thinking: params.thinking,
				replaceTemporary: params.replaceTemporary ?? false,
				models: selection.models,
				execute,
			});
		},
	});
}
