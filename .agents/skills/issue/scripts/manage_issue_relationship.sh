#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  manage_issue_relationship.sh --issue <number> --action <action> [--related <number>] [--parent <number>]

Actions:
  blocked_by         issue is blocked by related issue
  blocks             issue blocks related issue
  remove_blocked_by  remove blocked_by relationship
  remove_blocks      remove blocks relationship
  parent             attach issue as sub-issue of parent
  remove_parent      detach issue from current parent
EOF
}

ISSUE_NUMBER=""
ACTION=""
RELATED_NUMBER=""
PARENT_NUMBER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue)
      ISSUE_NUMBER="${2:-}"
      shift 2
      ;;
    --action)
      ACTION="${2:-}"
      shift 2
      ;;
    --related)
      RELATED_NUMBER="${2:-}"
      shift 2
      ;;
    --parent)
      PARENT_NUMBER="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

resolve_issue_id() {
  local number="$1"
  gh issue view "$number" --json id --jq '.id'
}

if [[ -z "$ISSUE_NUMBER" || -z "$ACTION" ]]; then
  usage >&2
  exit 1
fi

ISSUE_ID="$(resolve_issue_id "$ISSUE_NUMBER")"

add_blocked_by() {
  local issue_id="$1"
  local blocking_issue_id="$2"
  gh api graphql -f query='
mutation($issueId:ID!, $blockingIssueId:ID!) {
  addBlockedBy(input:{issueId:$issueId, blockingIssueId:$blockingIssueId}) {
    issue { number }
  }
}' -f issueId="$issue_id" -f blockingIssueId="$blocking_issue_id" >/dev/null
}

remove_blocked_by() {
  local issue_id="$1"
  local blocking_issue_id="$2"
  gh api graphql -f query='
mutation($issueId:ID!, $blockingIssueId:ID!) {
  removeBlockedBy(input:{issueId:$issueId, blockingIssueId:$blockingIssueId}) {
    issue { number }
  }
}' -f issueId="$issue_id" -f blockingIssueId="$blocking_issue_id" >/dev/null
}

add_sub_issue() {
  local parent_id="$1"
  local sub_issue_id="$2"
  gh api graphql -f query='
mutation($issueId:ID!, $subIssueId:ID!) {
  addSubIssue(input:{issueId:$issueId, subIssueId:$subIssueId}) {
    issue { number }
  }
}' -f issueId="$parent_id" -f subIssueId="$sub_issue_id" >/dev/null
}

remove_sub_issue() {
  local parent_id="$1"
  local sub_issue_id="$2"
  gh api graphql -f query='
mutation($issueId:ID!, $subIssueId:ID!) {
  removeSubIssue(input:{issueId:$issueId, subIssueId:$subIssueId}) {
    issue { number }
  }
}' -f issueId="$parent_id" -f subIssueId="$sub_issue_id" >/dev/null
}

case "$ACTION" in
  blocked_by)
    [[ -n "$RELATED_NUMBER" ]] || { echo "--related is required for $ACTION" >&2; exit 1; }
    RELATED_ID="$(resolve_issue_id "$RELATED_NUMBER")"
    add_blocked_by "$ISSUE_ID" "$RELATED_ID"
    echo "OK: #$ISSUE_NUMBER is blocked by #$RELATED_NUMBER"
    ;;
  blocks)
    [[ -n "$RELATED_NUMBER" ]] || { echo "--related is required for $ACTION" >&2; exit 1; }
    RELATED_ID="$(resolve_issue_id "$RELATED_NUMBER")"
    add_blocked_by "$RELATED_ID" "$ISSUE_ID"
    echo "OK: #$ISSUE_NUMBER blocks #$RELATED_NUMBER"
    ;;
  remove_blocked_by)
    [[ -n "$RELATED_NUMBER" ]] || { echo "--related is required for $ACTION" >&2; exit 1; }
    RELATED_ID="$(resolve_issue_id "$RELATED_NUMBER")"
    remove_blocked_by "$ISSUE_ID" "$RELATED_ID"
    echo "OK: removed blocked_by between #$ISSUE_NUMBER and #$RELATED_NUMBER"
    ;;
  remove_blocks)
    [[ -n "$RELATED_NUMBER" ]] || { echo "--related is required for $ACTION" >&2; exit 1; }
    RELATED_ID="$(resolve_issue_id "$RELATED_NUMBER")"
    remove_blocked_by "$RELATED_ID" "$ISSUE_ID"
    echo "OK: removed blocks between #$ISSUE_NUMBER and #$RELATED_NUMBER"
    ;;
  parent)
    [[ -n "$PARENT_NUMBER" ]] || { echo "--parent is required for $ACTION" >&2; exit 1; }
    PARENT_ID="$(resolve_issue_id "$PARENT_NUMBER")"
    add_sub_issue "$PARENT_ID" "$ISSUE_ID"
    echo "OK: #$ISSUE_NUMBER attached as sub-issue of #$PARENT_NUMBER"
    ;;
  remove_parent)
    CURRENT_PARENT_ID="$(gh api graphql -f query='
query($issueId:ID!) {
  node(id:$issueId) {
    ... on Issue {
      parent { id number }
    }
  }
}' -f issueId="$ISSUE_ID" --jq '.data.node.parent.id')"

    if [[ -z "$CURRENT_PARENT_ID" || "$CURRENT_PARENT_ID" == "null" ]]; then
      echo "No parent relationship found for #$ISSUE_NUMBER"
      exit 0
    fi

    remove_sub_issue "$CURRENT_PARENT_ID" "$ISSUE_ID"
    echo "OK: parent relationship removed from #$ISSUE_NUMBER"
    ;;
  *)
    echo "Invalid --action: $ACTION" >&2
    usage >&2
    exit 1
    ;;
esac
