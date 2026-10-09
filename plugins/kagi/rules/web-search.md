---
description: Every web search goes through Kagi (skill kagi); never another search engine or the built-in web search
alwaysApply: true
---
# Web search

- Search the web through Kagi (skill: kagi): the Kagi MCP tools first; the skill's CLI
  fallback only when those tools are missing or erroring.
- When both fail, report it. Never switch to another search engine or a built-in web search.
- Kagi is for searching. Fetch page contents (result URLs, URLs the user gives) with your
  normal read or fetch tool, not with Kagi tools.
