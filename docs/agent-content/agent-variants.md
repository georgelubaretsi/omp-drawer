# agent-variants: what agents receive

Each tinted box, and each cell under "What the agent gets", is exactly what the agent receives; everything else is a note. The sample: models Kimi K3 free on opencode, on a Kimi Code subscription, and paid per token on OpenRouter; a project with `reviewer` and `docs` agents.

**Contents:** [Tool](#tool) · [Results](#results) · [Errors](#errors) · [The variant's description](#the-variants-description) · [Not sent to agents](#not-sent-to-agents) · [All plugins](index.md)

## Tool

**Description**, sent in every model request:

> [!NOTE]
> Set up a temporary OMP agent variant when the user asks to launch, run, or delegate work with a particular model, provider, cost constraint, or reasoning level. Infer the source agent from intent: designer for UI/UX, reviewer for correctness review, security-reviewer for security, librarian for external research, scout for repository exploration, sonic only for explicitly mechanical work, otherwise task. This tool configures the variant but does not launch it. Project scope is mandatory unless the user explicitly requests global scope. Never claim project-write approval unless repository instructions were checked. Paid per-token selectors require explicit user approval.

**Parameters**, sent with it (`scope` has no description; it takes `project` or `global`):

| Parameter | What the agent gets |
| --- | --- |
| `sourceAgent` | Existing OMP agent behavior to preserve; omit only for generic task work. |
| `modelQuery` | Natural model request or exact selector, such as Kimi K3 or ox-alpha. |
| `thinking` | Requested thinking level; omit to preserve source-agent behavior. |
| `targetName` | Optional temporary agent name. |
| `subscriptionProviders` | Provider ids the user explicitly identified as subscription-backed. |
| `approvedPaidSelectors` | Exact paid selectors explicitly approved by the user for this setup. |
| `includePaidFallbacks` | Whether the user requested paid fallbacks in addition to free/subscription routes. |
| `projectWriteApproved` | True only after repository instructions and status permit the target .omp writes. |
| `replaceTemporary` | Update an existing temporary variant with the same name. |

## Results

**When:** the call succeeds.

**Project write not approved yet.** Call: `agent_variant_setup {"sourceAgent":"reviewer","modelQuery":"Kimi K3"}`

> [!NOTE]
> Project write not approved. Check repository instructions and status before creating .omp agent configuration.

**Paid fallbacks asked for, not yet approved.** Call: `agent_variant_setup {"sourceAgent":"reviewer","modelQuery":"Kimi K3","includePaidFallbacks":true,"projectWriteApproved":true,"subscriptionProviders":["kimi-code"]}`

> [!NOTE]
> Free/subscription routes available: opencode/kimi-k3-free, kimi-code/k3. Explicit approval is required before configuring paid per-token routes:\
> openrouter/moonshotai/kimi-k3: input 0.6, output 2.5, cache read 0.15, cache write 0

**Configured.** Call: `agent_variant_setup {"sourceAgent":"reviewer","modelQuery":"Kimi K3","projectWriteApproved":true,"subscriptionProviders":["kimi-code"]}`

> [!NOTE]
> Configured temporary reviewer variant tmp-reviewer-kimi-k3 using opencode/kimi-k3-free → kimi-code/k3. Use agent “tmp-reviewer-kimi-k3” for the user's original request.

## Errors

**When:** a call fails, or the tool passes on an error from the source agent's file or the project's config.

| When | What the agent gets |
| --- | --- |
| The variant name has other characters | Temporary agent names may contain only letters, numbers, underscores, and hyphens. |
| No model matches | No authenticated model matches “GPT-9” with xhigh thinking. |
| The variant exists already | tmp-reviewer-kimi-k3 already exists. Set replaceTemporary only after the user requests an update. |
| The variant has another source or role | tmp-reviewer-kimi-k3 belongs to a different temporary source or role. |
| The target is a regular agent | /home/user/shop-api/.omp/agents/docs.md already exists and is not a temporary agent variant. |
| `.omp` has uncommitted changes | Target OMP configuration has uncommitted changes; refusing to overwrite user work. |
| No such source agent | Agent “designer” was not found in project, user, or bundled agent definitions. |
| `omp config path` failed | Unable to resolve the active OMP config path: error: unknown command |
| `omp agents unpack` failed | Unable to export bundled agents: error: unknown command |
| The source agent has no frontmatter | Agent definition must contain YAML frontmatter. |
| It has no description | Agent frontmatter requires a non-empty description. |
| No model chosen | A temporary route requires at least one model selector. |
| The model role exists | Model role tmp\_docs\_kimi\_k3 already exists. |
| A model override would bypass the role | Agent tmp-docs-kimi-k3 has a persistent model override that would bypass its temporary role. |

**The source agent's frontmatter isn't valid YAML:**

> [!NOTE]
> Invalid agent frontmatter: Flow sequence in block collection must be sufficiently indented and end with a \] at line 1, column 12:
>
> name: \[docs\
>            ^

**`.omp/config.yml` isn't valid YAML:**

> [!NOTE]
> Invalid .omp/config.yml: Flow sequence in block collection must be sufficiently indented and end with a \] at line 2, column 1:
>
> modelRoles: \[
>
> ^

## The variant's description

**When:** written into `.omp/agents/<name>.md` when a variant is set up; the main agent sees it in the `task` tool's list of agents. The variant's prompt is the source agent's, unchanged.

> [!NOTE]
> Temporary reviewer variant for Kimi K3

## Not sent to agents

Shown to you only: the plugin and tool labels (Agent Variants, Set Up Agent Variant), and this notice when a session starts:

> [!NOTE]
> Temporary OMP agents in this project:\
> tmp-reviewer-kimi-k3 — from reviewer — Kimi K3
