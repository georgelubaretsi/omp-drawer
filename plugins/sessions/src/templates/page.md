{{#if entries}}
{{#if raw}}
{{#each entries}}
{{this}}
{{/each}}
{{else}}
{{#each entries}}
{{#unless @first}}

{{/unless}}
{{this}}
{{/each}}
{{/if}}
lines {{first}}–{{last}} · {{count}} entries
{{#with leftOut}}
page cap of {{cap}} characters: left out {{#with earlier}}{{count}} earlier entries (lines {{first}}–{{last}}){{/with}}{{#ifAll earlier later}} and {{/ifAll}}{{#with later}}{{count}} later entries (lines {{first}}–{{last}}){{/with}}
{{/with}}
{{#if earlierCall}}earlier: {{earlierCall}}{{else}}earlier: start of session{{/if}} · {{#if laterCall}}later: {{laterCall}}{{else}}later: end of session ({{length}} lines){{/if}}
{{else}}
no entries to show · end of session ({{length}} lines)
{{/if}}
