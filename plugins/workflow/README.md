# workflow

Rules and a skill on how to work, for any project.

| Rule | How omp loads it |
| --- | --- |
| `proportion`, `think-before-building`, `recurring-corrections` | in full, every agent |
| `proportion-review` | in full, the `reviewer` agent |
| `ask-for-decisions` | in full, the main agent |
| `project-tooling`, `changelog` | listed; the agent reads one when it applies |

The skill `failure-classes` lists ten general failure classes, each with its members and how to
test them.

## Codex code review

Codex code review doesn't load plugins. To give it the same bar for findings as the `reviewer`
agent, paste the text of `rules/proportion-review.md` (below its frontmatter) into ChatGPT
Settings > Code Review, and paste it again when this plugin's changelog says that rule changed.
OpenAI documents the setting for reviews started in the ChatGPT app; check that your GitHub
reviews follow it too.
