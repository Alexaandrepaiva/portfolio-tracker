#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/issue_spec_label_lib.sh"

usage() {
  cat <<'EOF'
Usage:
  sync_issue_spec_label.sh --issue <number> [--body-file <path>]
EOF
}

ISSUE_NUMBER=""
BODY_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue)
      ISSUE_NUMBER="${2:-}"
      shift 2
      ;;
    --body-file)
      BODY_FILE="${2:-}"
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

[[ -n "$ISSUE_NUMBER" ]] || { echo "--issue is required" >&2; exit 1; }
[[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]] || { echo "--issue must be a numeric issue number" >&2; exit 1; }

if [[ -n "$BODY_FILE" ]]; then
  [[ -f "$BODY_FILE" ]] || { echo "Body file not found: $BODY_FILE" >&2; exit 1; }
  temp_body_file_path_is_allowed "$BODY_FILE" || {
    echo "--body-file must be a regular non-symlink file inside TMPDIR or /tmp" >&2
    exit 1
  }
  BODY_FILE="$(canonicalize_existing_file "$BODY_FILE")"
  BODY_CONTENT="$(cat "$BODY_FILE")"
  CURRENT_LABELS="$(gh issue view "$ISSUE_NUMBER" --json labels --jq '.labels[]?.name')"
else
  ISSUE_JSON="$(gh issue view "$ISSUE_NUMBER" --json body,labels)"
  BODY_CONTENT="$(printf '%s' "$ISSUE_JSON" | jq -r '.body // ""')"
  CURRENT_LABELS="$(printf '%s' "$ISSUE_JSON" | jq -r '.labels[]?.name')"
fi

if body_looks_like_spec "$BODY_CONTENT"; then
  ensure_label_exists "spec"
  if ! printf '%s\n' "$CURRENT_LABELS" | grep -Fxq "spec"; then
    gh issue edit "$ISSUE_NUMBER" --add-label "spec" >/dev/null
    echo "SPEC_LABEL=added"
    exit 0
  fi
  echo "SPEC_LABEL=kept"
  exit 0
fi

if printf '%s\n' "$CURRENT_LABELS" | grep -Fxq "spec"; then
  gh issue edit "$ISSUE_NUMBER" --remove-label "spec" >/dev/null
  echo "SPEC_LABEL=removed"
  exit 0
fi

echo "SPEC_LABEL=absent"
