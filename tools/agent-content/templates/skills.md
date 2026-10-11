## Skills
{{#each skills}}

### `{{name}}`

**In the skills list**, in every session's system prompt while the {{../plugin}} plugin is on (omp may shorten the description):

{{entry}}

**When the agent reads `skill://{{name}}`**, which omp tells it to do first when the description matches the task. The whole file, as the agent gets it:

{{file}}
{{#each files}}

**When the agent reads `skill://{{../name}}/{{path}}`**, where the skill points it. The whole file:

{{text}}
{{/each}}
{{/each}}
