#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  edit_issue_project_fields.sh --issue <number> [--status "<status>"] [--lane "<execution-lane>"] [--project-owner "<owner>"] [--project-title "<title>"]
USAGE
}

ISSUE_NUMBER=""
STATUS=""
LANE=""
PROJECT_OWNER=""
PROJECT_TITLE="Portfolio Tracker Kanban"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue) ISSUE_NUMBER="${2:-}"; shift 2 ;;
    --status) STATUS="${2:-}"; shift 2 ;;
    --lane) LANE="${2:-}"; shift 2 ;;
    --project-owner) PROJECT_OWNER="${2:-}"; shift 2 ;;
    --project-title) PROJECT_TITLE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -n "$ISSUE_NUMBER" ]] || { echo "--issue is required" >&2; exit 1; }
if [[ -z "$STATUS" && -z "$LANE" ]]; then
  echo "At least one of --status or --lane is required" >&2
  exit 1
fi

REPO_FULL_NAME="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
REPO_OWNER="${REPO_FULL_NAME%%/*}"
PROJECT_OWNER="${PROJECT_OWNER:-$REPO_OWNER}"

ISSUE_URL="$(gh issue view "$ISSUE_NUMBER" --repo "$REPO_FULL_NAME" --json url --jq '.url')"
PROJECT_JSON="$(gh project list --owner "$PROJECT_OWNER" --format json)"
PROJECT_NUMBER="$(echo "$PROJECT_JSON" | jq -r --arg title "$PROJECT_TITLE" '.projects[] | select(.title==$title) | .number')"
PROJECT_ID="$(echo "$PROJECT_JSON" | jq -r --arg title "$PROJECT_TITLE" '.projects[] | select(.title==$title) | .id')"
[[ -n "$PROJECT_NUMBER" && "$PROJECT_NUMBER" != "null" ]] || { echo "Project not found: $PROJECT_TITLE" >&2; exit 1; }

ITEM_ID="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --limit 500 | jq -r --arg url "$ISSUE_URL" '.items[] | select(.content.url==$url) | .id')"
[[ -n "$ITEM_ID" && "$ITEM_ID" != "null" ]] || { echo "Failed to resolve project item id for issue URL: $ISSUE_URL" >&2; exit 1; }

FIELDS_JSON="$(gh project field-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json)"

if [[ -n "$STATUS" ]]; then
  STATUS_FIELD_ID="$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Status") | .id')"
  STATUS_OPTION_ID="$(echo "$FIELDS_JSON" | jq -r --arg status "$STATUS" '.fields[] | select(.name=="Status") | .options[] | select(.name==$status) | .id')"
  [[ -n "$STATUS_OPTION_ID" && "$STATUS_OPTION_ID" != "null" ]] || { echo "Invalid Status option: $STATUS" >&2; exit 1; }
  gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_OPTION_ID" >/dev/null
fi

if [[ -n "$LANE" ]]; then
  LANE_FIELD_ID="$(echo "$FIELDS_JSON" | jq -r '.fields[] | select(.name=="Execution Lane") | .id')"
  LANE_OPTION_ID="$(echo "$FIELDS_JSON" | jq -r --arg lane "$LANE" '.fields[] | select(.name=="Execution Lane") | .options[] | select(.name==$lane) | .id')"
  [[ -n "$LANE_FIELD_ID" && "$LANE_FIELD_ID" != "null" ]] || { echo "Execution Lane field not found in project" >&2; exit 1; }
  [[ -n "$LANE_OPTION_ID" && "$LANE_OPTION_ID" != "null" ]] || { echo "Invalid Execution Lane option: $LANE" >&2; exit 1; }
  gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" --field-id "$LANE_FIELD_ID" --single-select-option-id "$LANE_OPTION_ID" >/dev/null
fi

echo "ISSUE_NUMBER=$ISSUE_NUMBER"
if [[ -n "$STATUS" ]]; then
  echo "STATUS=$STATUS"
fi
if [[ -n "$LANE" ]]; then
  echo "LANE=$LANE"
fi
