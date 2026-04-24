# Agent Skills Guide

This document is the operational index for agent skills used in `portfolio-tracker`.

## Skill Map

### Core execution skills

- `agent-browser`
  - Use for deterministic browser navigation, UI checks, form flows, screenshots, and route validation evidence.
- `commit`
  - Use to stage/commit with Conventional Commit messages.
- `clarify-questions`
  - Use only when requirements are underspecified and a wrong implementation risk is high.
- `issue`
  - Use to create/edit issues and set project fields (`Status`, `Execution Lane`) on `Portfolio Tracker Kanban`.
  - When implementation is finished, always move issue `Status` to `Done`, close issue if applicable, and verify with `gh issue view`.
- `pr-merge`
  - Use for merge flow from current branch, with pre-merge checks and branch cleanup.
  - After merge, sync all linked closing issues to `Done` on Kanban and verify final state.
- `pr-review-fix`
  - Use to fetch PR review comments, triage by reviewer, apply safe fixes, and return a structured report.
- `subagent-plan-execute`
  - Use to execute an approved plan in a dedicated execution subagent thread.

### Dependency skills used by core flows

- `code-quality`
  - Invoked by `pr-merge` to run quality gates before merging.
- `pr-comment-analysis`
  - Invoked by `pr-review-fix` to classify review comments and decide safe fixes.
- `browser-test`
  - Used when a plan requires manual browser validation with local stack readiness.

## Dependency Graph

- `pr-merge` -> `code-quality` (+ `commit` when local changes exist)
- `pr-review-fix` -> `pr-comment-analysis`
- `subagent-plan-execute` -> may require `browser-test` for manual/UI validation steps

## Repository Paths

- Skills root: `.agents/skills/`
- Issue helpers:
  - `.agents/skills/issue/scripts/create_issue_with_project_fields.sh`
  - `.agents/skills/issue/scripts/edit_issue_project_fields.sh`
  - `.agents/skills/issue/scripts/manage_issue_relationship.sh`
  - `.agents/skills/issue/scripts/create_subissues.sh`
  - `.agents/skills/issue/scripts/sync_issue_spec_label.sh`

## Start-of-Work Checklist

1. Confirm target issue, scope, and lane.
2. Create/update branch for the issue.
3. Confirm required skills for the task.
4. Implement in small commits with validation evidence.
5. Run quality checks required by the changed surface.
6. Update issue/project status and share validation summary.

## Manual Validation (Agent Browser) Checklist

Use when UI behavior is changed.

1. Open impacted route(s) in desktop viewport.
2. Execute main user flow.
3. Validate loading/empty/error states where applicable.
4. Repeat critical path in mobile viewport.
5. Record concise evidence in PR description.
