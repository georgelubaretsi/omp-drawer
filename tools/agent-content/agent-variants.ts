// The agent-variants plugin's outputs for templates/agent-variants.md, from its tool run against
// a made-up project (agents `reviewer` and `docs`) and made-up models: Kimi K3 free, on a
// subscription, and paid per token. The wording around them is in the template.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createAgentVariant } from "../../plugins/agent-variants/src/agent-definition";
import agentVariants from "../../plugins/agent-variants/src/index";
import { configureTemporaryRoute } from "../../plugins/agent-variants/src/project-config";
import { templates } from "../../plugins/agent-variants/src/templates";
import type { Doc } from "./doc";

type Api = Parameters<typeof agentVariants>[0];
type Execute = (...args: unknown[]) => Promise<{ content: Array<{ text: string }> }>;
type Handler = (event: unknown, ctx: unknown) => Promise<void>;
/** What the stand-in git and omp answer: `git status` output, and which omp command fails. */
type Shell = { status?: string; fails?: "config" | "unpack" };

/** A stand-in for omp's zod: every call chains, so building the parameters only reads their descriptions. */
const chain: object = new Proxy(() => chain, { get: () => chain });

const cost = (input: number, output: number, cacheRead: number) => ({ input, output, cacheRead, cacheWrite: 0 });
const MODELS = [
	{ provider: "opencode", id: "kimi-k3-free", name: "Kimi K3 (free)", cost: cost(0, 0, 0) },
	{ provider: "kimi-code", id: "k3", name: "Kimi K3", cost: cost(0.6, 2.5, 0.15) },
	{ provider: "openrouter", id: "moonshotai/kimi-k3", name: "Kimi K3", cost: cost(0.6, 2.5, 0.15) },
].map(model => ({ ...model, thinking: { efforts: ["low", "medium", "high"] } }));

const APPROVED = { projectWriteApproved: true, subscriptionProviders: ["kimi-code"] };

function command(project: string, shell: Shell, name: string, args: string[]) {
	const failed = { code: 1, stdout: "", stderr: "error: unknown command" };
	if (name === "git") return { code: 0, stdout: shell.status ?? "", stderr: "" };
	if (args[0] === "config")
		return shell.fails === "config" ? failed : { code: 0, stdout: path.join(project, "user-omp"), stderr: "" };
	return shell.fails === "unpack" ? failed : { code: 0, stdout: "", stderr: "" };
}

/** The extension loaded with a stand-in for omp's API, in `project`. */
function load(doc: Doc, project: string, shell: Shell = {}) {
	let execute: Execute | undefined;
	let sessionStart: Handler | undefined;
	const notices: string[] = [];
	const pi = {
		zod: chain,
		setLabel: () => {},
		on: (event: string, handler: Handler) => {
			if (event === "session_start") sessionStart = handler;
		},
		registerTool: (tool: { execute: Execute }) => {
			execute = tool.execute;
		},
		exec: (name: string, args: string[]) => Promise.resolve(command(project, shell, name, args)),
	};
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stand-in for the parts of omp's API the extension uses
	agentVariants(pi as unknown as Api);
	const ctx = {
		cwd: project,
		models: { list: () => MODELS },
		ui: { notify: (text: string) => notices.push(text) },
		setTimeout: (run: () => void) => run(),
	};
	return {
		run: (params: Record<string, unknown>) =>
			doc.result(async () => (await execute?.("call", params, undefined, undefined, ctx))?.content[0]?.text),
		notices: async () => {
			await sessionStart?.({}, ctx);
			return notices.join("\n");
		},
	};
}

function writeProject(project: string): void {
	const agents = path.join(project, ".omp", "agents");
	mkdirSync(agents, { recursive: true });
	writeFileSync(
		path.join(agents, "reviewer.md"),
		"---\nname: reviewer\ndescription: Reviews changes for correctness\n---\n\nReview the change.\n",
	);
	writeFileSync(
		path.join(agents, "docs.md"),
		"---\nname: docs\ndescription: Writes documentation\n---\n\nWrite docs.\n",
	);
}

/** A tool call the template shows: a result as a box with its call, an error as a table cell. */
type Call = { params: Record<string, unknown>; shell?: Shell; box?: true };

const MISSING = { sourceAgent: "designer", modelQuery: "Kimi K3", ...APPROVED };

/** The tool calls the template shows, by the name it gives each, in order: later ones see earlier ones' files. */
const CALLS: Record<string, Call> = {
	blocked: { params: { sourceAgent: "reviewer", modelQuery: "Kimi K3" }, box: true },
	approval: {
		params: { sourceAgent: "reviewer", modelQuery: "Kimi K3", includePaidFallbacks: true, ...APPROVED },
		box: true,
	},
	configured: { params: { sourceAgent: "reviewer", modelQuery: "Kimi K3", ...APPROVED }, box: true },
	badName: { params: { modelQuery: "Kimi K3", targetName: "kimi reviewer", ...APPROVED } },
	noModel: { params: { modelQuery: "GPT-9", thinking: "xhigh", ...APPROVED } },
	exists: { params: { sourceAgent: "reviewer", modelQuery: "Kimi K3", ...APPROVED } },
	otherSource: {
		params: {
			sourceAgent: "docs",
			targetName: "tmp-reviewer-kimi-k3",
			modelQuery: "Kimi K3",
			replaceTemporary: true,
			...APPROVED,
		},
	},
	regularAgent: { params: { sourceAgent: "reviewer", targetName: "docs", modelQuery: "Kimi K3", ...APPROVED } },
	uncommitted: {
		params: { sourceAgent: "docs", modelQuery: "Kimi K3", ...APPROVED },
		shell: { status: " M .omp/config.yml" },
	},
	noSource: { params: MISSING },
	configPathFailed: { params: MISSING, shell: { fails: "config" } },
	unpackFailed: { params: MISSING, shell: { fails: "unpack" } },
};

// Errors from the source agent's file and the project's config, which the tool passes on.
async function fileErrors(doc: Doc): Promise<Record<string, string>> {
	const options = {
		name: "tmp-docs-kimi-k3",
		role: "tmp_docs_kimi_k3",
		requestedModel: "Kimi K3",
		createdAt: "2026-10-11T09:00:00.000Z",
	};
	const route = {
		agentName: "tmp-docs-kimi-k3",
		role: "tmp_docs_kimi_k3",
		selectors: ["kimi-code/k3"],
		allowExisting: false,
	};
	const cell = async (run: () => unknown) => doc.cell(await doc.result(run));
	const box = async (run: () => unknown) => doc.quote(await doc.result(run));
	return {
		noFrontmatter: await cell(() => createAgentVariant("Write docs.\n", options)),
		badFrontmatter: await box(() => createAgentVariant("---\nname: [docs\n---\n", options)),
		noDescription: await cell(() => createAgentVariant("---\nname: docs\n---\n", options)),
		noSelector: await cell(() => configureTemporaryRoute(undefined, { ...route, selectors: [] })),
		badConfig: await box(() => configureTemporaryRoute("modelRoles: [\n", route)),
		roleExists: await cell(() => configureTemporaryRoute("modelRoles:\n  tmp_docs_kimi_k3: openai/gpt-5\n", route)),
		override: await cell(() =>
			configureTemporaryRoute("task:\n  agentModelOverrides:\n    tmp-docs-kimi-k3: openai/gpt-5\n", route),
		),
	};
}

/** The values for templates/agent-variants.md; `project` is an empty folder for the sample project. */
export async function agentVariantsValues(doc: Doc, project: string): Promise<Record<string, unknown>> {
	writeProject(project);
	const names = [
		"sourceAgent",
		"modelQuery",
		"thinking",
		"targetName",
		"subscriptionProviders",
		"approvedPaidSelectors",
		"includePaidFallbacks",
		"projectWriteApproved",
		"replaceTemporary",
	];
	const values: Record<string, unknown> = {
		toolDescription: doc.quote(templates.tool.render()),
		parameters: Object.fromEntries(names.map(name => [name, doc.cell(templates.tool.text(`parameters.${name}`))])),
	};
	for (const [name, { params, shell, box }] of Object.entries(CALLS)) {
		const output = await load(doc, project, shell).run(params);
		values[name] = box ? doc.example(`agent_variant_setup ${JSON.stringify(params)}`, output) : doc.cell(output);
	}
	Object.assign(values, await fileErrors(doc));
	const written = readFileSync(path.join(project, ".omp", "agents", "tmp-reviewer-kimi-k3.md"), "utf8");
	values.variantDescription = doc.quote(/^description: (.*)$/m.exec(written)?.[1] ?? "");
	values.notice = doc.quote(await load(doc, project).notices());
	return values;
}
