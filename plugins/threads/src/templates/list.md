---
# Why a thread file could not be listed, or the project's .omp/threads.json read.
reasons:
  noFrontMatter: no front matter
  noField: 'no "{{name}}" in front matter'
  noCommit: no commit
  gitExited: "git exited {{status}}"
  noFolder: '{{config}} names no "folder" (the threads folder, relative to the folder holding .omp/)'
---
Open threads in {{folder}}/ ({{len threads}}{{#if dormant}}; {{dormant}} dormant not shown{{/if}}){{#if threads}}:{{else if unreadable}}:{{else}}.{{/if}}
{{#each threads}}
- {{slug}}{{#if questions}} · waiting on you ({{pluralize questions "question" "questions"}}){{/if}} · updated {{updated}}{{#if uncommitted}} (uncommitted){{/if}} · next: {{next}}{{#if area}} · {{area}}{{/if}}
{{/each}}
{{#each unreadable}}
- unreadable: {{source}}: {{reason}}
{{/each}}
