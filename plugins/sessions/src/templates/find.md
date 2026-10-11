{{#if raw}}
{{#each matches}}
{{raw}}
{{/each}}
{{else}}
{{#each matches}}
{{#unless @first}}

{{/unless}}
{{header}}
{{#if cutStart}}…{{/if}}{{snippet}}{{#if cutEnd}}…{{/if}}
{{/each}}
{{/if}}
{{pluralize total "match" "matches"}}{{#if from}} from line {{from}}{{/if}}{{#if moreCall}}, the first {{shown}} shown{{/if}}
{{#if readCall}}{{#if moreCall}}more: {{moreCall}} · {{/if}}read one: {{readCall}}{{/if}}
