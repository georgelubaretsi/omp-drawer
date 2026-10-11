{{#each questions}}
{{id}}: {{question}}
{{#each options}}
  - {{label}}{{#if description}}: {{description}}{{/if}}
{{/each}}
{{#if answered}}
  {{#each answer}}{{#unless @first}} · {{/unless}}{{#if picked}}picked: {{join picked ", "}}{{else}}typed: "{{typed}}"{{/if}}{{else}}no answer{{/each}}
{{/if}}
{{/each}}
{{#if text}}
{{text}}
{{/if}}
