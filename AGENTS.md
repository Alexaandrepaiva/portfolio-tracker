# Repository Guidelines

## Project Overview

- `portfolio-tracker` is a web product to track assets (Acoes/FIIs), ceiling price, margin of safety, and relevant-facts feed with AI summaries.
- Work in small, verifiable increments and keep tasks parallelizable.

## Skills in this repository

The following imported skills are available under `.agents/skills`:

- `agent-browser`
- `commit`
- `clarify-questions`
- `issue`
- `pr-merge`
- `pr-review-fix`
- `subagent-plan-execute`

Dependency skills imported for those workflows:

- `browser-test` (used by `subagent-plan-execute` for manual/browser validation workflows)
- `code-quality` (used by `pr-merge`)
- `pr-comment-analysis` (used by `pr-review-fix`)

## Operational defaults

- Prefer GitHub CLI (`gh`) for issue/PR/project actions.
- Keep commits in Conventional Commits format.
- Run lint/typecheck/tests before merge when the stack is available.
- Use project `Portfolio Tracker Kanban` for issue tracking unless the user asks otherwise.
