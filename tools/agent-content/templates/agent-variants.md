# agent-variants: what agents receive

Each tinted box, and each cell under "What the agent gets", is exactly what the agent receives; everything else is a note. The sample: models Kimi K3 free on opencode, on a Kimi Code subscription, and paid per token on OpenRouter; a project with `reviewer` and `docs` agents.

**Contents:** [Tool](#tool) · [Results](#results) · [Errors](#errors) · [The variant's description](#the-variants-description) · [Not sent to agents](#not-sent-to-agents) · [All plugins](index.md)

## Tool

**Description**, sent in every model request:

{{toolDescription}}

**Parameters**, sent with it (`scope` has no description; it takes `project` or `global`):

| Parameter | What the agent gets |
| --- | --- |
| `sourceAgent` | {{parameters.sourceAgent}} |
| `modelQuery` | {{parameters.modelQuery}} |
| `thinking` | {{parameters.thinking}} |
| `targetName` | {{parameters.targetName}} |
| `subscriptionProviders` | {{parameters.subscriptionProviders}} |
| `approvedPaidSelectors` | {{parameters.approvedPaidSelectors}} |
| `includePaidFallbacks` | {{parameters.includePaidFallbacks}} |
| `projectWriteApproved` | {{parameters.projectWriteApproved}} |
| `replaceTemporary` | {{parameters.replaceTemporary}} |

## Results

**When:** the call succeeds.

**Project write not approved yet.** Call: `{{blocked.call}}`

{{blocked.output}}

**Paid fallbacks asked for, not yet approved.** Call: `{{approval.call}}`

{{approval.output}}

**Configured.** Call: `{{configured.call}}`

{{configured.output}}

## Errors

**When:** a call fails, or the tool passes on an error from the source agent's file or the project's config.

| When | What the agent gets |
| --- | --- |
| The variant name has other characters | {{badName}} |
| No model matches | {{noModel}} |
| The variant exists already | {{exists}} |
| The variant has another source or role | {{otherSource}} |
| The target is a regular agent | {{regularAgent}} |
| `.omp` has uncommitted changes | {{uncommitted}} |
| No such source agent | {{noSource}} |
| `omp config path` failed | {{configPathFailed}} |
| `omp agents unpack` failed | {{unpackFailed}} |
| The source agent has no frontmatter | {{noFrontmatter}} |
| It has no description | {{noDescription}} |
| No model chosen | {{noSelector}} |
| The model role exists | {{roleExists}} |
| A model override would bypass the role | {{override}} |

**The source agent's frontmatter isn't valid YAML:**

{{badFrontmatter}}

**`.omp/config.yml` isn't valid YAML:**

{{badConfig}}

## The variant's description

**When:** written into `.omp/agents/<name>.md` when a variant is set up; the main agent sees it in the `task` tool's list of agents. The variant's prompt is the source agent's, unchanged.

{{variantDescription}}

## Not sent to agents

Shown to you only: the plugin and tool labels (Agent Variants, Set Up Agent Variant), and this notice when a session starts:

{{notice}}
