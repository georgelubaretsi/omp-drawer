---
# The parts of an entry besides its text.
thinking: "[thinking] {{text}}"
ask: |-
  [ask]
  {{ask}}
toolCall: "[tool call] {{name}} {{arguments}}"
image: "[image]"
# A part longer than a page shows, cut in the middle so its start and end stay.
cut: |-
  {{start}}
  … [{{count}} characters left out] …
  {{end}}
---
{{header}}
{{#each parts}}
{{this}}
{{/each}}
