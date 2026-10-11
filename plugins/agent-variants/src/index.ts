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
import { templates } from "./templates";

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

function slug(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return normalized || "model";
}

function textResult(text: string, details: ToolDetails): ToolResult {
	return { content: [{ type: "text", text }], details };
}

const described = (name: string) => templates.tool.text(`parameters.${name}`);

function buildParameters(z: ExtensionAPI["zod"]) {
	return z.object({
		sourceAgent: z.string().optional().describe(described("sourceAgent")),
		modelQuery: z.string().describe(described("modelQuery")),
		thinking: z.enum(THINKING_LEVELS).optional().describe(described("thinking")),
		targetName: z.string().optional().describe(described("targetName")),
		scope: z.enum(["project", "global"]).default("project"),
		subscriptionProviders: z.array(z.string()).optional().describe(described("subscriptionProviders")),
		approvedPaidSelectors: z.array(z.string()).optional().describe(described("approvedPaidSelectors")),
		includePaidFallbacks: z.boolean().default(false).describe(described("includePaidFallbacks")),
		projectWriteApproved: z.boolean().default(false).describe(described("projectWriteApproved")),
		replaceTemporary: z.boolean().default(false).describe(described("replaceTemporary")),
	});
}

function variantNames(params: { sourceAgent?: string; targetName?: string; modelQuery: string }): VariantNames {
	const sourceAgent = params.sourceAgent?.trim() || "task";
	const targetName = params.targetName?.trim() || `tmp-${sourceAgent}-${slug(params.modelQuery)}`;
	if (!/^[A-Za-z0-9_-]+$/.test(targetName)) throw new Error(templates.errors.badName.render());
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
	return textResult(templates.approval.render({ available, paid }), { status: "approval_required", paid });
}

// Returns whether an existing temporary variant may be replaced.
async function checkExistingAgent(agentPath: string, request: VariantRequest): Promise<boolean> {
	const existingAgent = await readExisting(agentPath);
	if (existingAgent === undefined) return false;
	const metadata = readTemporaryAgent(existingAgent);
	const { errors } = templates;
	if (!metadata) throw new Error(errors.notTemporary.render({ path: agentPath }));
	if (!request.replaceTemporary) throw new Error(errors.exists.render({ name: request.targetName }));
	if (metadata.sourceAgent !== request.sourceAgent || metadata.role !== request.role)
		throw new Error(errors.otherVariant.render({ name: request.targetName }));
	return true;
}

async function ensureCleanTargets(paths: ScopePaths, agentPath: string, execute: ExecuteCommand): Promise<void> {
	const configRelative = relative(paths.root, paths.configPath);
	const agentRelative = relative(paths.root, agentPath);
	const status = await execute("git", ["status", "--short", "--", configRelative, agentRelative], {
		cwd: paths.root,
		timeout: 10_000,
	});
	if (status.code === 0 && status.stdout.trim().length > 0) throw new Error(templates.errors.uncommitted.render());
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

	return textResult(templates.configured.render({ sourceAgent, targetName, selectors }), {
		status: "configured",
		agent: targetName,
		role,
		path: agentPath,
		models: selectors,
	});
}

export default function agentVariantsExtension(pi: ExtensionAPI) {
	const { tool } = templates;
	pi.setLabel(tool.text("plugin"));

	pi.on("session_start", async (_event, ctx) => {
		const temporary = await scanTemporaryAgents(ctx.cwd);
		if (temporary.length === 0) return;
		ctx.setTimeout(() => {
			ctx.ui.notify(templates.notice.render({ agents: temporary }), "info");
		}, 500);
	});

	const parameters = buildParameters(pi.zod);
	pi.registerTool<typeof parameters, ToolDetails>({
		name: "agent_variant_setup",
		label: tool.text("label"),
		description: tool.render(),
		approval: "write",
		loadMode: "essential",
		parameters,
		// oxlint-disable-next-line eslint/max-params -- the host's tool API fixes these five positional parameters
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const scope = params.scope ?? "project";
			if (scope === "project" && !params.projectWriteApproved) {
				return textResult(templates.blocked.render(), { status: "blocked" });
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
