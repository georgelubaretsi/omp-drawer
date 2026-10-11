{{#if available}}Free/subscription routes available: {{join available ", "}}. {{/if}}Explicit approval is required before configuring paid per-token routes:
{{#each paid}}
{{selector}}: input {{input}}, output {{output}}, cache read {{cacheRead}}, cache write {{cacheWrite}}
{{/each}}
