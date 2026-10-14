// Generated from model.ftl by `bun run build`; edit model.ftl.
import { Catalog } from "../kit/core/model";

const SOURCE =
	"## The agent_variant_setup tool: what it does, and what each argument is for.\n\nsetup = Set up a temporary OMP agent variant when the user asks to launch, run, or delegate work with a particular model, provider, cost constraint, or reasoning level. Infer the source agent from intent: designer for UI/UX, reviewer for correctness review, security-reviewer for security, librarian for external research, scout for repository exploration, sonic only for explicitly mechanical work, otherwise task. This tool configures the variant but does not launch it. Project scope is mandatory unless the user explicitly requests global scope. Never claim project-write approval unless repository instructions were checked. Models from a provider signed in with OAuth (a subscription login) are subscription routes; paid per-token selectors (API keys with a price) require explicit user approval.\n    .sourceAgent = Existing OMP agent behavior to preserve; omit only for generic task work.\n    .modelQuery = Natural model request or exact selector, such as Kimi K3 or ox-alpha.\n    .thinking = Requested thinking level; omit to preserve source-agent behavior.\n    .targetName = Optional temporary agent name.\n    .scope = Where the variant goes: project (the default), or global when the user asks for it.\n    .subscriptionProviders = Provider ids the user explicitly identified as subscription-backed; providers signed in with OAuth count as subscriptions already.\n    .approvedPaidSelectors = Exact paid selectors explicitly approved by the user for this setup.\n    .includePaidFallbacks = Whether the user requested paid fallbacks in addition to free/subscription routes.\n    .projectWriteApproved = True only after repository instructions and status permit the target .omp writes.\n    .replaceTemporary = Update an existing temporary variant with the same name.\n\n## The tool's answers.\n\nblocked = Project write not approved. Check that the repository's instructions allow writing .omp agent configuration (`git ls-files -- '*AGENTS.md' '*CLAUDE.md'` lists them; none means nothing forbids it), and that .omp has no changes not committed (`git status --short -- .omp`): if it has, tell the user and stop, since the tool won't write over them. Otherwise call agent_variant_setup again with projectWriteApproved: true. Don't edit .omp files yourself or move the variant to another scope to get around this.\napproval = { $available ->\n        [none] {\"\"}\n       *[other] Free/subscription routes available: { $available }.{\" \"}\n    }Explicit approval is required before configuring paid per-token routes:\napproval-route = { $selector }: input { $input }, output { $output }, cache read { $cacheRead }, cache write { $cacheWrite }\nconfigured = Configured temporary { $sourceAgent } variant { $targetName } using { $selectors }. Use agent \u201c{ $targetName }\u201d for the user's original request. The variant is ready as it is: set it up again only when the user asks for a change.\njoin-comma = { $a }, { $b }\njoin-arrow = { $a } \u2192 { $b }\n# The description written into the variant's agent file, which agents read when they pick one.\nvariant = Temporary { $sourceAgent } variant for { $model }\n\n## What each error means.\n\n# The tool's own code failing (a bug, an unexpected error), and arguments its schema doesn't take.\nerror-crashed = agent_variant_setup failed: { $cause }\nerror-arguments = The arguments don't fit agent_variant_setup: { $problem }\nerror-agent-not-found = Agent \u201c{ $name }\u201d was not found in project, user, or bundled agent definitions.\nerror-bad-config = Invalid .omp/config.yml: { $error }\nerror-bad-frontmatter = Invalid agent frontmatter: { $error }\nerror-bad-name = Temporary agent names may contain only letters, numbers, underscores, and hyphens.\nerror-config-path = Unable to resolve the active OMP config path: { $error }\nerror-exists = { $name } already exists. Set replaceTemporary only after the user requests an update.\nerror-export-failed = Unable to export bundled agents: { $error }\nerror-missing-field = Agent frontmatter requires a non-empty { $field }.\nerror-no-frontmatter = Agent definition must contain YAML frontmatter.\nerror-no-model = No authenticated model matches \u201c{ $query }\u201d{ $thinking ->\n        [none] {\"\"}\n       *[other] {\" \"}with { $thinking } thinking\n    }.\nerror-no-selector = A temporary route requires at least one model selector.\nerror-not-temporary = { $path } already exists and is not a temporary agent variant.\nerror-other-variant = { $name } belongs to a different temporary source or role.\nerror-persistent-override = Agent { $agent } has a persistent model override that would bypass its temporary role.\nerror-role-exists = Model role { $role } already exists.\nerror-uncommitted = Target OMP configuration has uncommitted changes; refusing to overwrite user work. Tell the user, who can commit or drop them; don't work around it with another scope or by editing the files yourself.\nerror-git-status = Couldn't check the target OMP configuration for uncommitted changes (git status: { $detail }); refusing to write.\n";

export type Messages = {
	approval: {
		available: string | number;
	};
	"approval-route": {
		cacheRead: string | number;
		cacheWrite: string | number;
		input: string | number;
		output: string | number;
		selector: string | number;
	};
	blocked: undefined;
	configured: {
		selectors: string | number;
		sourceAgent: string | number;
		targetName: string | number;
	};
	"error-agent-not-found": {
		name: string | number;
	};
	"error-arguments": {
		problem: string | number;
	};
	"error-bad-config": {
		error: string | number;
	};
	"error-bad-frontmatter": {
		error: string | number;
	};
	"error-bad-name": undefined;
	"error-config-path": {
		error: string | number;
	};
	"error-crashed": {
		cause: string | number;
	};
	"error-exists": {
		name: string | number;
	};
	"error-export-failed": {
		error: string | number;
	};
	"error-git-status": {
		detail: string | number;
	};
	"error-missing-field": {
		field: string | number;
	};
	"error-no-frontmatter": undefined;
	"error-no-model": {
		query: string | number;
		thinking: string | number;
	};
	"error-no-selector": undefined;
	"error-not-temporary": {
		path: string | number;
	};
	"error-other-variant": {
		name: string | number;
	};
	"error-persistent-override": {
		agent: string | number;
	};
	"error-role-exists": {
		role: string | number;
	};
	"error-uncommitted": undefined;
	"join-arrow": {
		a: string | number;
		b: string | number;
	};
	"join-comma": {
		a: string | number;
		b: string | number;
	};
	setup: undefined;
	"setup.approvedPaidSelectors": undefined;
	"setup.includePaidFallbacks": undefined;
	"setup.modelQuery": undefined;
	"setup.projectWriteApproved": undefined;
	"setup.replaceTemporary": undefined;
	"setup.scope": undefined;
	"setup.sourceAgent": undefined;
	"setup.subscriptionProviders": undefined;
	"setup.targetName": undefined;
	"setup.thinking": undefined;
	variant: {
		model: string | number;
		sourceAgent: string | number;
	};
};

export const model = new Catalog<Messages>(SOURCE);
