#!/usr/bin/env bash

load_existing_labels() {
  if [[ "${ISSUE_SPEC_LABELS_LOADED:-0}" == "1" ]]; then
    return 0
  fi

  ISSUE_EXISTING_LABELS=()
  while IFS= read -r label; do
    ISSUE_EXISTING_LABELS+=("$label")
  done < <(gh label list --limit 200 --json name | jq -r '.[].name')
  ISSUE_SPEC_LABELS_LOADED=1
}

canonicalize_existing_dir() {
  local path="$1"
  [[ -d "$path" ]] || return 1
  (cd "$path" && pwd -P)
}

canonicalize_existing_file() {
  local path="$1"
  local dir
  local base

  [[ -e "$path" ]] || return 1
  dir="$(canonicalize_existing_dir "$(dirname -- "$path")")" || return 1
  base="$(basename -- "$path")"
  printf '%s/%s\n' "$dir" "$base"
}

temp_body_file_path_is_allowed() {
  local path="$1"
  local resolved_file
  local resolved_tmpdir=""
  local resolved_tmp=""

  [[ -f "$path" ]] || return 1
  [[ ! -L "$path" ]] || return 1

  resolved_file="$(canonicalize_existing_file "$path")" || return 1

  if [[ -n "${TMPDIR:-}" ]]; then
    resolved_tmpdir="$(canonicalize_existing_dir "${TMPDIR%/}")" || return 1
    case "$resolved_file" in
      "$resolved_tmpdir"/*) return 0 ;;
    esac
  fi

  resolved_tmp="$(canonicalize_existing_dir "/tmp")" || return 1
  case "$resolved_file" in
    "$resolved_tmp"/*) return 0 ;;
  esac

  return 1
}

label_exists() {
  local target="$1"
  load_existing_labels
  printf '%s\n' "${ISSUE_EXISTING_LABELS[@]}" | grep -Fxq -- "$target"
}

ensure_label_exists() {
  local target="$1"
  if ! label_exists "$target"; then
    echo "Label '$target' does not exist. Create it or replace it before continuing." >&2
    exit 1
  fi
}

append_label_once() {
  local target="$1"
  shift || true
  local label
  local found=0
  for label in "$@"; do
    if [[ "$label" == "$target" ]]; then
      found=1
    fi
    [[ -z "$label" ]] && continue
    printf '%s\n' "$label"
  done

  if [[ "$found" != "1" ]]; then
    printf '%s\n' "$target"
  fi
}

join_labels_csv() {
  local labels=()
  local label
  for label in "$@"; do
    [[ -n "$label" ]] && labels+=("$label")
  done

  local joined=""
  for label in "${labels[@]}"; do
    if [[ -n "$joined" ]]; then
      joined+=","
    fi
    joined+="$label"
  done

  printf '%s\n' "$joined"
}

body_looks_like_spec() {
  local body="$1"
  local normalized
  local non_empty_lines

  normalized="$(printf '%s' "$body" | tr -d '\r')"
  normalized="${normalized#"${normalized%%[![:space:]]*}"}"
  normalized="${normalized%"${normalized##*[![:space:]]}"}"

  if [[ -z "$normalized" || "$normalized" == "(auto)" ]]; then
    return 1
  fi

  non_empty_lines="$(printf '%s\n' "$normalized" | awk 'NF { count++ } END { print count + 0 }')"
  if (( non_empty_lines < 2 )); then
    return 1
  fi

  if printf '%s\n' "$normalized" | grep -Eq '^(#{1,6}[[:space:]]|[-*][[:space:]]|[0-9]+\.[[:space:]]|[-*][[:space:]]\[[ xX]\][[:space:]]|>[[:space:]]|```)' ; then
    return 0
  fi

  return 1
}
