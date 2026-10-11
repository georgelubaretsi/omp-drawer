session {{session}} matches {{total}} sessions; give a longer id{{#if more}} (the first {{len files}} listed){{/if}}:
{{#each files}}
  {{file}}{{#if title}} — {{title}}{{/if}}
{{/each}}
