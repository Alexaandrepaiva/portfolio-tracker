#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/issue_spec_label_lib.sh"

usage() {
  cat <<'USAGE'
Usage:
  create_issue_with_project_fields.sh \
    --title "<title>" \
    [--body "<body>"] \
    [--label "<label>"]... \
    [--status "<status>"] \
    [--lane "<execution-lane>"] \
    [--milestone "<milestone>"] \
    [--assignee "<username>"] \
    [--project-owner "<owner>"] \
    [--project-title "<title>"]

Defaults:
  --status Todo
  --project-owner <repo-owner>
  --project-title "Portfolio Tracker Kanban"
USAGE
}

TITLE=""
BODY=""
STATUS="Todo"
LANE=""
MILESTONE=""
ASSIGNEE=""
PROJECT_OWNER=""
PROJECT_TITLE="Portfolio Tracker Kanban"
LABELS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) TITLE="${2:-}"; shift 2 ;;
    --body) BODY="${2:-}"; shift 2 ;;
    --label) LABELS+=("${2:-}"); shift 2 ;;
    --status) STATUS="${2:-}"; shift 2 ;;
    --lane) LANE="${2:-}"; shift 2 ;;
    --milestone) MILESTONE="${2:-}"; shift 2 ;;
    --assignee) ASSIGNEE="${2:-}"; shift 2 ;;
    --project-owner) PROJECT_OWNER="${2:-}"; shift 2 ;;
    --project-title) PROJECT_TITLE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

[[ -n "$TITLE" ]] || { echo "--title is required" >&2; exit 1; }

REPO_FULL_NAME="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
REPO_OWNER="${REPO_FULL_NAME%%/*}"
PROJECT_OWNER="${PROJECT_OWNER:-$REPO_OWNER}"

if body_looks_like_spec "$BODY"; then
  updated_labels=()
  while IFS= read -r label; do
    updated_labels+=("$label")
  done < <(append_label_once "spec" "${LABELS[@]}")
  LABELS=("${updated_labels[@]}")
fi

for label in "${LABELS[@]}"; do
  [[ -z "$label" ]] && continue
  ensure_label_exists "$label"
done

create_args=(--repo "$REPO_FULL_NAME" --title "$TITLE")
if [[ -n "$BODY" ]]; then
  create_args+=(--body "$BODY")
else
  create_args+=(--body "(auto)")
fi
for label in "${LABELS[@]}"; do
  [[ -n "$label" ]] && create_args+=(--label "$label")
done
[[ -n "$MILESTONE" ]] && create_args+=(--milestone "$MILESTONE")
[[ -n "$ASSIGNEE" ]] && create_args+=(--assignee "$ASSIGNEE")

PROJECT_JSON="$(gh project list --owner "$PROJECT_OWNER" --format json)"
PROJECT_NUMBER="$(echo "$PROJECT_JSON" | jq -r --arg title "$PROJECT_TITLE" '.projects[] | select(.title==$title) | .number')"
PROJECT_ID="$(echo "$PROJECT_JSON" | jq -r --arg title "$PROJECT_TITLE" '.projects[] | select(.title==$title) | .id')"

if [[ -n "$PROJECT_NUMBER" && "$PROJECT_NUMBER" != "null" ]]; then
  create_args+=(--project "$PROJECT_TITLE")
fi

ISSUE_URL="$(gh issue create "${create_args[@]}")"
ISSUE_NUMBER="$(echo "$ISSUE_URL" | sed -E 's|.*/issues/([0-9]+)$|\1|')"
[[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]] || { echo "Failed to parse issue number from URL: $ISSUE_URL" >&2; exit 1; }

if [[ -n "$PROJECT_NUMBER" && "$PROJECT_NUMBER" != "null" && -n "$PROJECT_ID" && "$PROJECT_ID" != "null" ]]; then
  ITEM_ID="$(gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" --format json --limit 500 \
    | jq -r --arg url "$ISSUE_URL" '.items[] | select(.content.url==$url) | .id')"

  if [[ -n "$ITEM_ID" && "$ITEM_ID" != "null" ]]; then
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
  fi
fi

echo "ISSUE_NUMBER=$ISSUE_NUMBER"
echo "ISSUE_URL=$ISSUE_URL"
echo "PROJECT_TITLE=$PROJECT_TITLE"
echo "STATUS=$STATUS"
echo "LANE=$LANE"
echo "LABELS=$(join_labels_csv "${LABELS[@]}")"
