---
name: issue
description: Create, edit, and fetch GitHub issues using GitHub CLI (gh) for the current repository/project.
metadata:
  short-description: Manage issues in GitHub
---

# Issue

## Objective

Provide a safe flow for creating, editing, and fetching issues with `gh`, including project status/lane updates for this repository.

## Instructions

- Always verify requested labels and milestones exist before create/edit.
- If a requested label/milestone does not exist, ask whether to create or replace.
- If no label is provided, auto-select from: `bug`, `improvement`, `fix`, `documentation`, `feature`, `refactor`.
- Keep automatic `spec` label behavior:
  - add `spec` when the body matches a structured spec;
  - remove `spec` when it no longer matches.
- Support optional create/edit metadata:
  - `assign`
  - `milestone`
  - `status` (project `Status` field)
  - `lane` (project `Execution Lane` field)
- Support relationship operations via GraphQL mutations (`blocked_by`, `blocks`, `parent`, removal variants).

## Defaults

- Project title default: `Portfolio Tracker Kanban`
- Project owner default: current repository owner
- Status default: `Todo`
- Lane default: empty (do not set unless asked)

## Fetch issue content

```bash
gh issue view <number> --json body --template "{{.body}}"
```

## Create issue

Use helper script:

```bash
.agents/skills/issue/scripts/create_issue_with_project_fields.sh \
  --title "<title>" \
  --body "(auto)" \
  --label "<label1>" \
  --label "<label2>" \
  --status "${STATUS_VALUE:-Todo}" \
  ${LANE_VALUE:+--lane "$LANE_VALUE"} \
  ${MILESTONE_VALUE:+--milestone "$MILESTONE_VALUE"} \
  ${ASSIGN_VALUE:+--assignee "$ASSIGN_VALUE"}
```

## Edit issue title/labels/milestone/assignee

```bash
gh issue edit <number> --title "<new-title>" --add-label "<label>" --remove-label "<label>" --milestone "<milestone>" --add-assignee "<user>" --remove-assignee "<user>"
```

## Edit project fields (Status and Execution Lane)

```bash
.agents/skills/issue/scripts/edit_issue_project_fields.sh \
  --issue <number> \
  ${STATUS_VALUE:+--status "$STATUS_VALUE"} \
  ${LANE_VALUE:+--lane "$LANE_VALUE"}
```

## Edit relationships / sub-issues

```bash
.agents/skills/issue/scripts/manage_issue_relationship.sh --issue 410 --action blocked_by --related 402
.agents/skills/issue/scripts/manage_issue_relationship.sh --issue 410 --action blocks --related 402
.agents/skills/issue/scripts/manage_issue_relationship.sh --issue 410 --action parent --parent 300
```

## Create sub-issues in one flow

```bash
.agents/skills/issue/scripts/create_subissues.sh --parent 300 --spec-file /tmp/subissues.json
```

Spec format:

```json
[
  {
    "title": "Implement dashboard endpoint",
    "body": "Acceptance criteria:\n- ...",
    "labels": ["feature"],
    "status": "Todo",
    "lane": "Home",
    "milestone": "",
    "assignee": ""
  }
]
```

## Edit issue body + sync `spec`

```bash
BODY=$(gh issue view <number> --json body --template "{{.body}}")
gh issue edit <number> --body-file "<tmp_body_file>"
.agents/skills/issue/scripts/sync_issue_spec_label.sh --issue <number> --body-file "<tmp_body_file>"
```
