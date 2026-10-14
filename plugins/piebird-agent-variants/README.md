# piebird-agent-variants

Run any omp agent on the model you name. Ask for a review "on Claude Haiku" or a refactor "with
Kimi K3 at high thinking", and omp makes a temporary copy of the right agent (`reviewer`, `task`,
`designer`, …) routed to that model, then hands it the work.

[![omp makes a temporary reviewer on Claude Haiku and hands it a review](../../demos/piebird-agent-variants/demo.webp)](../../demos/piebird-agent-variants/demo.mp4)

## Install

    omp plugin marketplace add georgelubaretsi/piebird
    omp plugin install piebird-agent-variants@piebird

## How it works

The `agent_variant_setup` tool matches your words to a model you're signed in to, picks the
agent whose job fits, and writes the variant into the project: `.omp/agents/tmp-<agent>-<model>.md`
(the source agent's prompt, unchanged) and a model role in `.omp/config.yml`. The agent then
uses it for your request.

- Free and subscription routes come first; a model paid per token needs your yes, with its
  price shown.
- It writes only after checking the project allows it, never over uncommitted `.omp` changes or
  agents and roles it didn't make, and replaces its own variants only when you ask.
- Project scope by default; global only when you ask for it.
- A new session lists the project's temporary agents.

[What the model sees](../../docs/model/piebird-agent-variants.md): the tool's description, its
answers and errors, word for word.
