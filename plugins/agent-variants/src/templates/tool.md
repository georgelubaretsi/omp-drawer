---
plugin: Agent Variants
label: Set Up Agent Variant
parameters:
  sourceAgent: Existing OMP agent behavior to preserve; omit only for generic task work.
  modelQuery: Natural model request or exact selector, such as Kimi K3 or ox-alpha.
  thinking: Requested thinking level; omit to preserve source-agent behavior.
  targetName: Optional temporary agent name.
  subscriptionProviders: Provider ids the user explicitly identified as subscription-backed.
  approvedPaidSelectors: Exact paid selectors explicitly approved by the user for this setup.
  includePaidFallbacks: Whether the user requested paid fallbacks in addition to free/subscription routes.
  projectWriteApproved: True only after repository instructions and status permit the target .omp writes.
  replaceTemporary: Update an existing temporary variant with the same name.
---
Set up a temporary OMP agent variant when the user asks to launch, run, or delegate work with a particular model, provider, cost constraint, or reasoning level. Infer the source agent from intent: designer for UI/UX, reviewer for correctness review, security-reviewer for security, librarian for external research, scout for repository exploration, sonic only for explicitly mechanical work, otherwise task. This tool configures the variant but does not launch it. Project scope is mandatory unless the user explicitly requests global scope. Never claim project-write approval unless repository instructions were checked. Paid per-token selectors require explicit user approval.
