---
# An answer longer than the tool returns, cut at its end.
truncated: |-
  {{text}}
  … truncated at {{max}} of {{length}} characters; return less (fields, a slice, a count)
---
{{#if printed}}
printed:
{{printed}}

{{/if}}
result:
{{#if result}}{{result}}{{else}}nil{{/if}}
{{#if note}}

note: {{note}}
{{/if}}
