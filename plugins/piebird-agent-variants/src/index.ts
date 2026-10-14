// piebird-agent-variants in omp: the agent_variant_setup tool, which writes a temporary variant of
// an agent (.omp/agents/<name>.md) and routes its model role to the models the request names
// (.omp/config.yml), and a notice at session start listing the temporary agents a project has.
// Choosing the models is core's (core/selection.ts); reading and writing omp's files is here.
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { CallSignal, Outcome } from "../kit/core/operations";
import type { ModelCandidate, RankedModel } from "../core/domain";
import type { SetupRequest } from "../core/request";
import type { ExecuteCommand } from "./storage";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { model } from "../core/model.gen";
import { operations } from "../core/operations.gen";
import { joined, readRequest, VariantError } from "../core/request";
import { selectModels } from "../core/selection";
import { joinText } from "../kit/core/model";
import { registerOperations } from "../kit/omp/tools";
import { createAgentVariant, readTemporaryAgent } from "./agent-definition";
import { configureTemporaryRoute } from "./project-config";
import {
	loadSourceAgent,
	readExisting,
	resolveScopePaths,
	scanTemporaryAgents,
	writeVariantTransaction,
} from "./storage";

/** What the extension works with: omp's, or a test's. */
export interface Surroundings {
	/** The models signed in for the calling session. */
	models(ctx: ExtensionContext): ModelCandidate[];
	readonly execute: ExecuteCommand;
	/** The time a variant is created at, ISO. */
	now(): string;
	/** The call's signal, which aborts when the call is cancelled: nothing is written after. */
	readonly signal?: AbortSignal;
}

/** `at` for one call: its commands run under the call's signal (omp's AbortSignal). */
function forCall(at: Surroundings, signal: CallSignal | undefined): Surroundings {
	if (!(signal instanceof AbortSignal)) return at;
	const execute: ExecuteCommand = (command, args, options) =>
		at.execute(command, args, { ...options, signal: options?.signal ?? signal });
	return { ...at, execute, signal };
}

function runtimeModels(ctx: ExtensionContext): ModelCandidate[] {
	return ctx.models.list().map(m => ({
		provider: m.provider,
		id: m.id,
		name: m.name,
		cost: m.cost,
		efforts: m.thinking?.efforts ?? [],
		oauth: ctx.modelRegistry.isUsingOAuth(m),
	}));
}

function approvalOutcome(paidModels: readonly RankedModel[], free: readonly RankedModel[]): Outcome {
	const paid = paidModels.map(m => ({
		selector: m.selector,
		input: m.cost.input,
		output: m.cost.output,
		cacheRead: m.cost.cacheRead,
		cacheWrite: m.cost.cacheWrite,
	}));
	// Prices as written, not rounded the locale's way.
	const routes = paid.map(p =>
		model.text("approval-route", {
			selector: p.selector,
			input: String(p.input),
			output: String(p.output),
			cacheRead: String(p.cacheRead),
			cacheWrite: String(p.cacheWrite),
		}),
	);
	const available = joined(
		free.map(m => m.selector),
		"join-comma",
	);
	const text = joinText([model.text("approval", { available: available || "none" }), ...routes]);
	return { ok: true, text, data: { status: "approval_required", paid } };
}

/** Whether an existing variant at `agentPath` may be replaced; refuses one it may not. */
async function mayReplace(agentPath: string, request: SetupRequest): Promise<boolean> {
	const existing = await readExisting(agentPath);
	if (existing === undefined) return false;
	const metadata = readTemporaryAgent(existing);
	if (!metadata) throw new VariantError("not-temporary", model.text("error-not-temporary", { path: agentPath }));
	if (!request.replaceTemporary)
		throw new VariantError("exists", model.text("error-exists", { name: request.targetName }));
	if (metadata.sourceAgent !== request.sourceAgent || metadata.role !== request.role)
		throw new VariantError("other-variant", model.text("error-other-variant", { name: request.targetName }));
	return true;
}

/** Whether `dir` or a folder above it holds `.git` (a folder, or a worktree's file). */
function underGit(dir: string): boolean {
	for (let at = dir; ; at = dirname(at)) {
		if (existsSync(join(at, ".git"))) return true;
		if (dirname(at) === at) return false;
	}
}

/**
 * Refuses to write over uncommitted changes to `files`, and whenever git can't say whether there
 * are any (a timeout, safe.directory, a damaged repository). Only a project with no `.git` above
 * it has nothing to check against; that's read from the folders, as git's own words vary.
 */
async function refuseUncommitted(root: string, files: string[], execute: ExecuteCommand): Promise<void> {
	if (!underGit(root)) return;
	const paths = files.map(file => relative(root, file));
	const status = await execute("git", ["status", "--short", "--", ...paths], { cwd: root, timeout: 10_000 });
	if (status.code !== 0) {
		const detail = status.stderr.trim().split("\n")[0] || `exit ${status.code}`;
		throw new VariantError("git-status", model.text("error-git-status", { detail }));
	}
	if (status.stdout.trim().length > 0) throw new VariantError("uncommitted", model.text("error-uncommitted"));
}

async function configure(request: SetupRequest, routes: readonly RankedModel[], cwd: string, at: Surroundings) {
	const paths = await resolveScopePaths(cwd, request.scope, at.execute);
	const agentPath = join(paths.agentsDir, `${request.targetName}.md`);
	const allowExisting = await mayReplace(agentPath, request);
	if (request.scope === "project") await refuseUncommitted(paths.root, [paths.configPath, agentPath], at.execute);
	const source = await loadSourceAgent(request.sourceAgent, cwd, at.execute);
	const selectors = routes.map(m => m.selector);
	const update = { agentName: request.targetName, role: request.role, selectors, allowExisting };
	const configContent = configureTemporaryRoute(await readExisting(paths.configPath), update);
	const agentContent = createAgentVariant(source, {
		name: request.targetName,
		role: request.role,
		requestedModel: request.modelQuery,
		createdAt: at.now(),
		...(request.thinking === undefined ? {} : { thinking: request.thinking }),
	});
	at.signal?.throwIfAborted();
	await writeVariantTransaction({ agentPath, agentContent, configPath: paths.configPath, configContent });
	const { sourceAgent, targetName, role } = request;
	const text = model.text("configured", { sourceAgent, targetName, selectors: joined(selectors, "join-arrow") });
	const data = { status: "configured", agent: targetName, role, path: agentPath, models: selectors };
	return { ok: true as const, text, data };
}

async function setup(input: unknown, ctx: ExtensionContext, at: Surroundings): Promise<Outcome> {
	try {
		const request = readRequest(input);
		if (request.scope === "project" && !request.projectWriteApproved)
			return { ok: true, text: model.text("blocked"), data: { status: "blocked" } };
		const selection = selectModels(at.models(ctx), { ...request, query: request.modelQuery });
		if (selection.status === "not_found") {
			const thinking = request.thinking ?? "none";
			throw new VariantError("no-model", model.text("error-no-model", { query: request.modelQuery, thinking }));
		}
		if (selection.status === "approval_required")
			return approvalOutcome(selection.paid, selection.availableWithoutPayment);
		return await configure(request, selection.models, ctx.cwd, at);
	} catch (error) {
		if (error instanceof VariantError) return { ok: false, error: error.id, text: error.said };
		throw error;
	}
}

/** The temporary agents a project has, for the person: a notice, not text for the model. */
function notice(agents: readonly { name: string; sourceAgent: string; requestedModel: string }[]): string {
	const lines = agents.map(a => `${a.name} — from ${a.sourceAgent} — ${a.requestedModel}`);
	return ["Temporary OMP agents in this project:", ...lines].join("\n");
}

export function variantsInOmp(pi: ExtensionAPI, at: Surroundings): void {
	pi.setLabel("Agent Variants");
	pi.on("session_start", async (_event, ctx) => {
		const temporary = await scanTemporaryAgents(ctx.cwd);
		if (temporary.length === 0) return;
		ctx.setTimeout(() => ctx.ui.notify(notice(temporary), "info"), 500);
	});
	registerOperations(pi, operations, (ctx: ExtensionContext) => ({
		setup: (input, signal) => setup(input, ctx, forCall(at, signal)),
	}));
}

export default function agentVariants(pi: ExtensionAPI): void {
	variantsInOmp(pi, {
		models: runtimeModels,
		execute: (command, args, options) => pi.exec(command, args, options),
		now: () => new Date().toISOString(),
	});
}
