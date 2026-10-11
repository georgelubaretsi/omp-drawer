## Rules
{{#each rules}}

### `{{name}}`

{{#if always}}
**When:** always, in every session's system prompt while the {{../plugin}} plugin is on. The rule's body, as the agent gets it (omp leaves out the front matter):
{{else}}
**In the rules list**, in every session's system prompt while the {{../plugin}} plugin is on:

{{entry}}

**When the agent reads `rule://{{name}}`**, when its work matches the description. The rule's body, as the agent gets it (omp leaves out the front matter):
{{/if}}

{{body}}
{{/each}}
