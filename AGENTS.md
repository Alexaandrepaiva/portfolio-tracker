# Repository Guidelines

## Product Vision

- `portfolio-tracker` is a web platform to manage a portfolio of `Acoes` and `FIIs`.
- MVP surfaces:
  - `Home`: quotes, ceiling price, margin of safety, daily change, and asset management.
  - `Fatos Relevantes`: filtered feed of AI-processed documents per asset.

## Scope Boundaries

- Keep business logic explicit and testable.
- Keep agent skills reusable and repository-scoped.
- Avoid adding provider-specific assumptions into UI components.
- Do not expose credentials/secrets in client code, logs, issues, or PR comments.

## Parallel Execution Contract

- Work is organized by issue lanes in `Portfolio Tracker Kanban`.
- Recommended execution split:
  - `Foundation`: standards, docs, governance, platform baseline.
  - `Data`: schema, ingestion, market providers.
  - `Home`: dashboard and asset management UX.
  - `Facts`: relevant-facts feed and filters.
  - `AI`: document analysis routing and publishing.
  - `Ops`: observability, CI, validation runbooks.
- One branch per issue. Do not share branches across issues.

## Branch, PR, and Commit Conventions

- Branch naming:
  - `feature/<issue-number>-<short-slug>`
  - `fix/<issue-number>-<short-slug>`
  - `chore/<issue-number>-<short-slug>`
- Commit format (Conventional Commits):
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `chore(scope): ...`
  - `docs(scope): ...`
  - `refactor(scope): ...`
  - `test(scope): ...`
  - `agents(scope): ...` for changes in `.agents/skills` or orchestration prompts.
- PR minimum requirements:
  - linked issue(s)
  - concise change summary
  - validation evidence (commands + results)
  - risks/limitations

## Financial Data Security Rules

- Never log or commit API keys, tokens, cookies, session identifiers, private credentials, or raw provider payloads.
- Redact sensitive values in examples and debug output.
- Keep `.env*` outside commits, except `.env.example` with non-sensitive placeholders.
- Treat document ingestion sources and user portfolio information as sensitive operational data.

## Required Validation Before Merge

Run the maximum applicable checks for the stack under change.

- Documentation-only changes:
  - markdown lint/check (if configured)
  - broken link/path sanity check
- Code changes (when toolchain exists):
  - lint
  - typecheck
  - unit/integration tests
  - build
- UI changes:
  - route-level manual validation with `agent-browser`
  - desktop + mobile viewport checks
  - error/loading/empty-state checks when relevant

Always report:

- which checks ran
- what passed/failed
- what was not run and why

## Agent Browser Validation Policy

Use `agent-browser` for manual UI evidence when routes/components are changed.

- Validate exact routes touched by the PR.
- Include key user actions and expected outcomes.
- Capture at least:
  - page loads
  - primary action success path
  - one relevant error or guardrail path
- For auth-gated routes, use controlled test credentials from local env only.

## Skills Available in This Repository

Primary imported skills:

- `agent-browser`
- `commit`
- `clarify-questions`
- `issue`
- `pr-merge`
- `pr-review-fix`
- `subagent-plan-execute`

Dependency skills required by the primary workflow:

- `browser-test`
- `code-quality`
- `pr-comment-analysis`

See full usage map in `docs/agents/README.md`.

## Operational Defaults

- Prefer `gh` for issue/PR/project operations.
- Default project board: `Portfolio Tracker Kanban`.
- Project field defaults for issue operations:
  - `Status`: `Todo`
  - `Execution Lane`: set only when relevant to planning/execution split.
