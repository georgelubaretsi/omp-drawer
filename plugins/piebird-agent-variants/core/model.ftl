## The agent_variant_setup tool: what it does, and what each argument is for.

setup = Set up a temporary OMP agent variant when the user asks to launch, run, or delegate work with a particular model, provider, cost constraint, or reasoning level. Infer the source agent from intent: designer for UI/UX, reviewer for correctness review, security-reviewer for security, librarian for external research, scout for repository exploration, sonic only for explicitly mechanical work, otherwise task. This tool configures the variant but does not launch it. Project scope is mandatory unless the user explicitly requests global scope. Never claim project-write approval unless repository instructions were checked. Models from a provider signed in with OAuth (a subscription login) are subscription routes; paid per-token selectors (API keys with a price) require explicit user approval.
    .sourceAgent = Existing OMP agent behavior to preserve; omit only for generic task work.
    .modelQuery = Natural model request or exact selector, such as Kimi K3 or ox-alpha.
    .thinking = Requested thinking level; omit to preserve source-agent behavior.
    .targetName = Optional temporary agent name.
    .scope = Where the variant goes: project (the default), or global when the user asks for it.
    .subscriptionProviders = Provider ids the user explicitly identified as subscription-backed; providers signed in with OAuth count as subscriptions already.
    .approvedPaidSelectors = Exact paid selectors explicitly approved by the user for this setup.
    .includePaidFallbacks = Whether the user requested paid fallbacks in addition to free/subscription routes.
    .projectWriteApproved = True only after repository instructions and status permit the target .omp writes.
    .replaceTemporary = Update an existing temporary variant with the same name.

## The tool's answers.

blocked = Project write not approved. Check that the repository's instructions allow writing .omp agent configuration (`git ls-files -- '*AGENTS.md' '*CLAUDE.md'` lists them; none means nothing forbids it), and that .omp has no changes not committed (`git status --short -- .omp`): if it has, tell the user and stop, since the tool won't write over them. Otherwise call agent_variant_setup again with projectWriteApproved: true. Don't edit .omp files yourself or move the variant to another scope to get around this.
approval = { $available ->
        [none] {""}
       *[other] Free/subscription routes available: { $available }.{" "}
    }Explicit approval is required before configuring paid per-token routes:
approval-route = { $selector }: input { $input }, output { $output }, cache read { $cacheRead }, cache write { $cacheWrite }
configured = Configured temporary { $sourceAgent } variant { $targetName } using { $selectors }. Use agent “{ $targetName }” for the user's original request. The variant is ready as it is: set it up again only when the user asks for a change.
join-comma = { $a }, { $b }
join-arrow = { $a } → { $b }
# The description written into the variant's agent file, which agents read when they pick one.
variant = Temporary { $sourceAgent } variant for { $model }

## What each error means.

# The tool's own code failing (a bug, an unexpected error), and arguments its schema doesn't take.
error-crashed = agent_variant_setup failed: { $cause }
error-arguments = The arguments don't fit agent_variant_setup: { $problem }
error-agent-not-found = Agent “{ $name }” was not found in project, user, or bundled agent definitions.
error-bad-config = Invalid .omp/config.yml: { $error }
error-bad-frontmatter = Invalid agent frontmatter: { $error }
error-bad-name = Temporary agent names may contain only letters, numbers, underscores, and hyphens.
error-config-path = Unable to resolve the active OMP config path: { $error }
error-exists = { $name } already exists. Set replaceTemporary only after the user requests an update.
error-export-failed = Unable to export bundled agents: { $error }
error-missing-field = Agent frontmatter requires a non-empty { $field }.
error-no-frontmatter = Agent definition must contain YAML frontmatter.
error-no-model = No authenticated model matches “{ $query }”{ $thinking ->
        [none] {""}
       *[other] {" "}with { $thinking } thinking
    }.
error-no-selector = A temporary route requires at least one model selector.
error-not-temporary = { $path } already exists and is not a temporary agent variant.
error-other-variant = { $name } belongs to a different temporary source or role.
error-persistent-override = Agent { $agent } has a persistent model override that would bypass its temporary role.
error-role-exists = Model role { $role } already exists.
error-uncommitted = Target OMP configuration has uncommitted changes; refusing to overwrite user work. Tell the user, who can commit or drop them; don't work around it with another scope or by editing the files yourself.
error-git-status = Couldn't check the target OMP configuration for uncommitted changes (git status: { $detail }); refusing to write.
