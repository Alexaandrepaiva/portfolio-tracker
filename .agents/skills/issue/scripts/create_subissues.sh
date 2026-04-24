#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  create_subissues.sh --parent <number> --spec-file <path-to-json> [--project-owner "<owner>"] [--project-title "<title>"]

Spec JSON format (array):
[
  {
    "title": "Child issue title",
    "body": "Optional body",
    "labels": ["feature"],
    "status": "Todo",
    "lane": "Home",
    "milestone": "Optional milestone",
    "assignee": "Optional username"
  }
]
USAGE
}

PARENT_NUMBER=""
SPEC_FILE=""
PROJECT_OWNER=""
PROJECT_TITLE="Portfolio Tracker Kanban"
DEFAULT_STATUS="Todo"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --parent) PARENT_NUMBER="${2:-}"; shift 2 ;;
    --spec-file) SPEC_FILE="${2:-}"; shift 2 ;;
    --project-owner) PROJECT_OWNER="${2:-}"; shift 2 ;;
    --project-title) PROJECT_TITLE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -n "$PARENT_NUMBER" && -n "$SPEC_FILE" ]] || { usage >&2; exit 1; }
[[ -f "$SPEC_FILE" ]] || { echo "Spec file not found: $SPEC_FILE" >&2; exit 1; }
jq -e 'type == "array" and length > 0' "$SPEC_FILE" >/dev/null

REPO_FULL_NAME="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
REPO_OWNER="${REPO_FULL_NAME%%/*}"
PROJECT_OWNER="${PROJECT_OWNER:-$REPO_OWNER}"
PARENT_ID="$(gh issue view "$PARENT_NUMBER" --repo "$REPO_FULL_NAME" --json id --jq '.id')"

PROJECT_JSON="$(gh project list --owner "$PROJECT_OWNER" --format json)"
PROJECT_NUMBER="$(echo "$PROJECT_JSON" | jq -r --arg title "$PROJECT_TITLE" '.projects[] | select(.title==$title) | .number')"
PROJECT_ID="$(echo "$PROJECT_JSON" | jq -r --arg title "$PROJECT_TITLE" '.projects[] | select(.title==$title) | .id')"
FIELDS_JSON="$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json)"

STATUS_FIELD_ID="$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .id')"
LANE_FIELD_ID="$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Execution Lane") | .id')"

count="$(jq 'length' "$SPEC_FILE")"
for ((i=0; i<count; i++)); do
  title="$(jq -r ".[$i].title // empty" "$SPEC_FILE")"
  body="$(jq -r ".[$i].body // \"\"" "$SPEC_FILE")"
  status="$(jq -r ".[$i].status // \"$DEFAULT_STATUS\"" "$SPEC_FILE")"
  lane="$(jq -r ".[$i].lane // empty" "$SPEC_FILE")"
  milestone="$(jq -r ".[$i].milestone // empty" "$SPEC_FILE")"
  assignee="$(jq -r ".[$i].assignee // empty" "$SPEC_FILE")"

  [[ -n "$title" ]] || { echo "Item $i has empty title" >&2; exit 1; }

  mapfile -t labels < <(jq -r ".[$i].labels[]? // empty" "$SPEC_FILE")
  label_args=()
  for label in "${labels[@]}"; do label_args+=(--label "$label"); done

  extra_args=()
  [[ -n "$milestone" ]] && extra_args+=(--milestone "$milestone")
  [[ -n "$assignee" ]] && extra_args+=(--assignee "$assignee")

  ISSUE_URL="$(gh issue create --repo "$REPO_FULL_NAME" --title "$title" --body "$body" --project "$PROJECT_TITLE" "${label_args[@]}" "${extra_args[@]}")"
  ISSUE_NUMBER="$(echo "$ISSUE_URL" | sed -E 's|.*/issues/([0-9]+)$|\1|')"
  ISSUE_ID="$(gh issue view "$ISSUE_NUMBER" --repo "$REPO_FULL_NAME" --json id --jq '.id')"

  ITEM_ID="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --limit 500 | jq -r --arg url "$ISSUE_URL" '.items[] | select(.content.url==$url) | .id')"

  STATUS_OPTION_ID="$(echo "$FIELDS_JSON" | jq -r --arg status "$status" '.fields[] | select(.name=="Status") | .options[] | select(.name==$status) | .id')"
  [[ -n "$STATUS_OPTION_ID" && "$STATUS_OPTION_ID" != "null" ]] || { echo "Invalid Status option: $status" >&2; exit 1; }
  gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_OPTION_ID" >/dev/null

  if [[ -n "$lane" ]]; then
    [[ -n "$LANE_FIELD_ID" && "$LANE_FIELD_ID" != "null" ]] || { echo "Execution Lane field not found in project" >&2; exit 1; }
    LANE_OPTION_ID="$(echo "$FIELDS_JSON" | jq -r --arg lane "$lane" '.fields[] | select(.name=="Execution Lane") | .options[] | select(.name==$lane) | .id')"
    [[ -n "$LANE_OPTION_ID" && "$LANE_OPTION_ID" != "null" ]] || { echo "Invalid Execution Lane option: $lane" >&2; exit 1; }
    gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" --field-id "$LANE_FIELD_ID" --single-select-option-id "$LANE_OPTION_ID" >/dev/null
  fi

  gh api graphql -f query='mutation($issueId:ID!, $subIssueId:ID!) { addSubIssue(input:{issueId:$issueId, subIssueId:$subIssueId}) { issue { number } } }' -f issueId="$PARENT_ID" -f subIssueId="$ISSUE_ID" >/dev/null
  echo "Created and linked sub-issue: #$ISSUE_NUMBER ($ISSUE_URL)"
done
