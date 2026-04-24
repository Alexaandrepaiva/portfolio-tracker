#!/usr/bin/env python3
"""Fetch PR review comments and group them by reviewer."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any


REPO_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
BRANCH_PATTERN = re.compile(r"^[A-Za-z0-9._/-]+$")
GITHUB_SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$", flags=re.IGNORECASE)
PR_RELATED_WORKFLOW_EVENTS = {
    "pull_request",
    "pull_request_target",
    "pull_request_review",
    "pull_request_review_comment",
}


def run_gh_json(args: list[str]) -> Any:
    cmd = ["gh", *args]
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "GitHub CLI (`gh`) is not installed or not available on PATH.\n"
            "Install `gh` and authenticate it before running this skill."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise RuntimeError(f"Failed command: {' '.join(cmd)}\n{stderr}") from exc
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        parsed_values: list[Any] = []
        decoder = json.JSONDecoder()
        output = result.stdout
        index = 0
        while index < len(output):
            while index < len(output) and output[index].isspace():
                index += 1
            if index >= len(output):
                break
            try:
                value, next_index = decoder.raw_decode(output, index)
            except json.JSONDecodeError as inner_exc:
                raise RuntimeError(
                    f"Invalid JSON output from command: {' '.join(cmd)}"
                ) from inner_exc
            parsed_values.append(value)
            index = next_index

        if not parsed_values:
            raise RuntimeError(
                f"Invalid JSON output from command: {' '.join(cmd)}"
            ) from exc

        if all(isinstance(value, list) for value in parsed_values):
            merged: list[Any] = []
            for value in parsed_values:
                merged.extend(value)
            return merged

        if len(parsed_values) == 1:
            return parsed_values[0]

        return parsed_values


# The active review window is anchored to the latest eligible event timestamp,
# not wall clock time, so clustered historical reviews can still be selected.
WINDOW_MINUTES = 30
DEFAULT_CHECKS_TIMEOUT_SECONDS = 16 * 60
CHECKS_POLL_INTERVAL_SECONDS = 2 * 60
NO_RELEVANT_RUNS_RETRY_LIMIT = 2


def parse_github_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def isoformat_or_none(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


DETACHED_HEAD_ERROR = "Current branch is detached."


def get_current_branch() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Git is not installed or not available on PATH.\n"
            "Install `git` before running this skill."
        ) from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise RuntimeError(
            "Failed to determine current branch for PR inference.\n"
            f"{stderr}"
        ) from exc
    branch = (result.stdout or "").strip()
    if not branch or branch == "HEAD":
        raise RuntimeError(DETACHED_HEAD_ERROR)
    if branch.startswith("-") or not BRANCH_PATTERN.fullmatch(branch):
        raise RuntimeError(
            f"Invalid branch format: {branch!r}. Branch names must be safe CLI values."
        )
    if ".." in branch:
        raise RuntimeError(
            f"Invalid branch format: {branch!r}. Branch names must not contain '..'."
        )
    return branch


def get_repo(repo_arg: str | None) -> str:
    repo = repo_arg
    if repo is None:
        repo = run_gh_json(["repo", "view", "--json", "nameWithOwner"])["nameWithOwner"]

    if not isinstance(repo, str) or not REPO_PATTERN.fullmatch(repo):
        raise RuntimeError(
            f"Invalid repository format: {repo!r}. Expected 'owner/name'."
        )
    return repo


def get_pr_number(pr_arg: int | None, repo: str | None = None) -> int:
    if pr_arg is not None:
        return pr_arg
    if repo:
        try:
            branch = get_current_branch()
        except RuntimeError as exc:
            if str(exc) != DETACHED_HEAD_ERROR:
                raise
            try:
                return int(
                    run_gh_json(["pr", "view", "--repo", repo, "--json", "number"])[
                        "number"
                    ]
                )
            except RuntimeError as view_exc:
                raise RuntimeError(
                    "Current branch is detached, and GitHub CLI could not infer the PR. "
                    "Pass --pr explicitly."
                ) from view_exc
        prs = run_gh_json(
            [
                "pr",
                "list",
                "--repo",
                repo,
                "--head",
                branch,
                "--json",
                "number",
                "--limit",
                "1",
            ]
        )
        if isinstance(prs, list) and prs:
            return int(prs[0]["number"])
        raise RuntimeError(
            f"No PR found for branch '{branch}' in repository '{repo}'. "
            "Pass --pr explicitly."
        )
    return int(run_gh_json(["pr", "view", "--json", "number"])["number"])


def fetch_all_comments(repo: str, pr_number: int) -> list[dict[str, Any]]:
    comments = run_gh_json(
        [
            "api",
            "--paginate",
            f"repos/{repo}/pulls/{pr_number}/comments",
        ]
    )
    if not isinstance(comments, list):
        raise RuntimeError("GitHub API returned unexpected payload for PR comments.")
    return comments


def fetch_all_reviews(repo: str, pr_number: int) -> list[dict[str, Any]]:
    reviews = run_gh_json(
        [
            "api",
            "--paginate",
            f"repos/{repo}/pulls/{pr_number}/reviews",
        ]
    )
    if not isinstance(reviews, list):
        raise RuntimeError("GitHub API returned unexpected payload for PR reviews.")
    return reviews


def fetch_all_issue_comments(repo: str, pr_number: int) -> list[dict[str, Any]]:
    issue_comments = run_gh_json(
        [
            "api",
            "--paginate",
            f"repos/{repo}/issues/{pr_number}/comments",
        ]
    )
    if not isinstance(issue_comments, list):
        raise RuntimeError(
            "GitHub API returned unexpected payload for PR issue comments."
        )
    return issue_comments


def fetch_pr(repo: str, pr_number: int) -> dict[str, Any]:
    pr = run_gh_json(
        [
            "api",
            f"repos/{repo}/pulls/{pr_number}",
        ]
    )
    if not isinstance(pr, dict):
        raise RuntimeError("GitHub API returned unexpected payload for pull request.")
    return pr


def fetch_workflow_runs(repo: str, head_sha: str) -> list[dict[str, Any]]:
    if not isinstance(head_sha, str) or not GITHUB_SHA_PATTERN.fullmatch(head_sha):
        raise ValueError(
            f"Invalid workflow run head SHA format: {head_sha!r}. Expected a 40-character hex SHA."
        )
    payload = run_gh_json(
        [
            "api",
            "--paginate",
            f"repos/{repo}/actions/runs?head_sha={head_sha}&per_page=100",
        ]
    )
    payloads = payload if isinstance(payload, list) else [payload]
    runs: list[dict[str, Any]] = []

    for page in payloads:
        if not isinstance(page, dict):
            raise RuntimeError(
                "GitHub API returned unexpected payload for workflow runs."
            )
        page_runs = page.get("workflow_runs")
        if not isinstance(page_runs, list):
            raise RuntimeError(
                "GitHub API returned unexpected workflow_runs payload format."
            )
        runs.extend(page_runs)

    return runs


def describe_runs(runs: list[dict[str, Any]]) -> str:
    def run_label(run: dict[str, Any]) -> str:
        name = run.get("name") or f"workflow#{run.get('workflow_id') or 'unknown'}"
        run_number = run.get("run_number")
        suffix = f"#{run_number}" if run_number is not None else ""
        status = run.get("status") or "unknown-status"
        conclusion = run.get("conclusion")
        if status == "completed":
            return f"{name}{suffix}({conclusion or 'unknown-conclusion'})"
        return f"{name}{suffix}({status})"

    return ", ".join(run_label(run) for run in runs)


def wait_for_actions_success(
    repo: str,
    pr_number: int,
    timeout_seconds: int,
    poll_interval_seconds: int = CHECKS_POLL_INTERVAL_SECONDS,
) -> None:
    if timeout_seconds <= 0:
        raise RuntimeError("Checks timeout must be greater than zero seconds.")
    if poll_interval_seconds <= 0:
        raise RuntimeError("Checks poll interval must be greater than zero seconds.")

    pr = fetch_pr(repo, pr_number)
    head = pr.get("head") or {}
    head_sha = head.get("sha")
    head_ref = head.get("ref")
    if not isinstance(head_sha, str):
        raise RuntimeError(
            f"Pull request #{pr_number} in {repo} has no valid head SHA."
        )
    head_sha = head_sha.strip()
    if not head_sha:
        raise RuntimeError(
            f"Pull request #{pr_number} in {repo} has no valid head SHA."
        )
    if not GITHUB_SHA_PATTERN.fullmatch(head_sha):
        raise RuntimeError(
            f"Pull request #{pr_number} in {repo} returned an invalid head SHA format."
        )

    deadline = time.monotonic() + timeout_seconds
    no_relevant_runs_attempts = 0
    while True:
        runs = fetch_workflow_runs(repo, head_sha)
        relevant_runs = [
            run
            for run in runs
            if (
                any(
                    (pr_ref or {}).get("number") == pr_number
                    for pr_ref in run.get("pull_requests", [])
                )
                or (
                    not run.get("pull_requests")
                    and isinstance(head_ref, str)
                    and head_ref
                    and (run.get("event") or "").lower() in PR_RELATED_WORKFLOW_EVENTS
                    and run.get("head_branch") == head_ref
                )
            )
        ]
        if not relevant_runs:
            if no_relevant_runs_attempts < NO_RELEVANT_RUNS_RETRY_LIMIT:
                no_relevant_runs_attempts += 1
                remaining_seconds = int(deadline - time.monotonic())
                if remaining_seconds <= 0:
                    break
                time.sleep(min(poll_interval_seconds, max(1, remaining_seconds)))
                continue
            print(
                f"Warning: no GitHub Actions workflow runs found for PR #{pr_number} head {head_sha}; proceeding.",
                file=sys.stderr,
            )
            return

        non_completed_runs = []
        failed_runs = []
        for run in relevant_runs:
            status = (run.get("status") or "").lower()
            if status == "completed":
                conclusion = (run.get("conclusion") or "").lower()
                if conclusion not in {"success", "skipped"}:
                    failed_runs.append(run)
            else:
                non_completed_runs.append(run)

        if failed_runs:
            raise RuntimeError(
                "GitHub Actions checks did not all succeed or skip for "
                f"PR #{pr_number}: {describe_runs(failed_runs)}"
            )

        if not non_completed_runs:
            return

        remaining_seconds = int(deadline - time.monotonic())
        if remaining_seconds <= 0:
            raise RuntimeError(
                "Timed out waiting for GitHub Actions checks to finish for "
                f"PR #{pr_number}. Still running: {describe_runs(non_completed_runs)}"
            )

        print(
            "Waiting for GitHub Actions checks to finish for "
            f"PR #{pr_number} ({remaining_seconds}s left): {describe_runs(non_completed_runs)}",
            file=sys.stderr,
        )
        time.sleep(min(poll_interval_seconds, max(1, remaining_seconds)))


CODE_REVIEW_HEADING_PATTERN = re.compile(
    r"^\s*(?:#{1,6}\s*)?code\s+review\b",
    flags=re.IGNORECASE,
)
CODE_REVIEW_HTML_HEADING_PATTERN = re.compile(
    r"^\s*<h[1-6][^>]*>\s*code\s+review\b.*?</h[1-6]>\s*$",
    flags=re.IGNORECASE,
)


def extract_code_review_section(body: str) -> str | None:
    normalized_body = (body or "").strip()
    if not normalized_body:
        return None

    lines = normalized_body.splitlines()
    for index, line in enumerate(lines):
        if CODE_REVIEW_HEADING_PATTERN.match(line) or CODE_REVIEW_HTML_HEADING_PATTERN.match(
            line
        ):
            return "\n".join(lines[index:]).strip()
    return None


def is_bot_user(user: dict[str, Any]) -> bool:
    login = user.get("login")
    user_type = user.get("type")
    return bool(user_type == "Bot" or (isinstance(login, str) and login.endswith("[bot]")))


def format_comment_entry(comment: dict[str, Any]) -> str:
    path = comment.get("path") or "unknown-path"
    line = comment.get("line")
    line_text = f":{line}" if line is not None else ""
    body = (comment.get("body") or "").strip() or "(empty)"
    return f"[{path}{line_text}]\n{body}"


def merge_review_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged_by_key: dict[tuple[str, str], dict[str, Any]] = {}

    for event in sorted(
        events,
        key=lambda item: (
            item.get("created_at_dt") or datetime.min.replace(tzinfo=timezone.utc),
            item.get("id") or 0,
        ),
    ):
        source = event.get("source")
        review_group_id = event.get("review_group_id")
        review_group_key = (
            f"review:{review_group_id}"
            if review_group_id is not None
            else f"review_comment:{event.get('id')}"
            if source == "review_comment" and event.get("id") is not None
            else f"{source}:{event.get('id')}"
        )
        key = (event["reviewer"].lower(), review_group_key)
        existing = merged_by_key.get(key)
        if existing is None:
            merged_by_key[key] = {
                **event,
                "comments": list(event.get("comments") or []),
            }
            continue

        existing_comments = existing.get("comments") or []
        combined_comments = existing_comments + list(event.get("comments") or [])
        deduped_comments: list[dict[str, Any]] = []
        seen_comment_keys: set[tuple[Any, Any, Any]] = set()
        for comment in combined_comments:
            comment_key = (
                comment.get("id"),
                comment.get("url"),
                comment.get("created_at"),
            )
            if comment_key in seen_comment_keys:
                continue
            seen_comment_keys.add(comment_key)
            deduped_comments.append(comment)

        event_dt = event.get("created_at_dt")
        existing_dt = existing.get("created_at_dt")
        if event_dt is not None and (
            existing_dt is None
            or (event_dt, event.get("id") or 0) > (existing_dt, existing.get("id") or 0)
        ):
            existing["created_at_dt"] = event_dt
            existing["created_at"] = event.get("created_at")
            existing["url"] = event.get("url") or existing.get("url")
            existing["path"] = event.get("path") or existing.get("path")
            existing["line"] = event.get("line") or existing.get("line")
            existing["side"] = event.get("side") or existing.get("side")
            existing["commit_id"] = event.get("commit_id") or existing.get("commit_id")

        existing_body = (existing.get("body") or "").strip()
        incoming_body = (event.get("body") or "").strip()
        if incoming_body:
            if not existing_body:
                existing_body = incoming_body
            elif incoming_body not in existing_body:
                existing_body = f"{existing_body}\n\n{incoming_body}"
        existing["body"] = existing_body
        existing["comments"] = deduped_comments
        if source == "review":
            existing["source"] = "review"
            existing["review_state"] = event.get("review_state") or existing.get("review_state")

    return list(merged_by_key.values())


def build_review_events(
    comments: list[dict[str, Any]],
    reviews: list[dict[str, Any]],
    issue_comments: list[dict[str, Any]],
    reviewer_filter: set[str],
    exclude_bots: bool,
) -> list[dict[str, Any]]:
    normalized_reviewer_filter = {reviewer.lower() for reviewer in reviewer_filter}
    grouped_inline_reviews: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    standalone_events: list[dict[str, Any]] = []

    for comment in comments:
        user = comment.get("user") or {}
        login = user.get("login")
        if not login:
            continue
        if exclude_bots and is_bot_user(user):
            continue
        if normalized_reviewer_filter and login.lower() not in normalized_reviewer_filter:
            continue

        review_id = comment.get("pull_request_review_id")
        if review_id is not None:
            grouped_inline_reviews[(login, int(review_id))].append(comment)
            continue

        created_at = parse_github_datetime(comment.get("created_at"))
        standalone_events.append(
            {
                "id": comment.get("id"),
                "event_id": f"comment-{comment.get('id')}",
                "reviewer": login,
                "source": "review_comment",
                "url": comment.get("html_url"),
                "path": comment.get("path"),
                "line": comment.get("line"),
                "side": comment.get("side"),
                "commit_id": comment.get("commit_id"),
                "created_at": isoformat_or_none(created_at),
                "created_at_dt": created_at,
                "body": (comment.get("body") or "").strip(),
                "in_reply_to_id": comment.get("in_reply_to_id"),
                "comments": [
                    {
                        "id": comment.get("id"),
                        "url": comment.get("html_url"),
                        "path": comment.get("path"),
                        "line": comment.get("line"),
                        "side": comment.get("side"),
                        "body": (comment.get("body") or "").strip(),
                        "created_at": comment.get("created_at"),
                    }
                ],
            }
        )

    review_events: list[dict[str, Any]] = []
    for (login, review_id), review_comments in grouped_inline_reviews.items():
        sorted_comments = sorted(
            review_comments,
            key=lambda item: (
                parse_github_datetime(item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
                item.get("id") or 0,
            ),
        )
        latest_comment = sorted_comments[-1]
        latest_created_at = parse_github_datetime(latest_comment.get("created_at"))
        review_events.append(
            {
                "id": review_id,
                "review_group_id": review_id,
                "event_id": f"review-{review_id}",
                "reviewer": login,
                "source": "review_comment",
                "url": latest_comment.get("html_url"),
                "path": latest_comment.get("path"),
                "line": latest_comment.get("line"),
                "side": latest_comment.get("side"),
                "commit_id": latest_comment.get("commit_id"),
                "created_at": isoformat_or_none(latest_created_at),
                "created_at_dt": latest_created_at,
                "body": "\n\n".join(
                    [
                        format_comment_entry(
                            {
                                "path": item.get("path"),
                                "line": item.get("line"),
                                "body": (item.get("body") or "").strip(),
                            }
                        )
                        for item in sorted_comments
                    ]
                ).strip(),
                "in_reply_to_id": None,
                "comments": [
                    {
                        "id": item.get("id"),
                        "url": item.get("html_url"),
                        "path": item.get("path"),
                        "line": item.get("line"),
                        "side": item.get("side"),
                        "body": (item.get("body") or "").strip(),
                        "created_at": item.get("created_at"),
                    }
                    for item in sorted_comments
                ],
            }
        )

    for review in reviews:
        user = review.get("user") or {}
        login = user.get("login")
        if not login:
            continue
        if exclude_bots and is_bot_user(user):
            continue
        if normalized_reviewer_filter and login.lower() not in normalized_reviewer_filter:
            continue
        body = extract_code_review_section(review.get("body") or "")
        if not body:
            continue
        submitted_at = parse_github_datetime(review.get("submitted_at"))
        review_events.append(
            {
                "id": review.get("id"),
                "review_group_id": review.get("id"),
                "event_id": f"top-level-review-{review.get('id')}",
                "reviewer": login,
                "source": "review",
                "url": review.get("html_url"),
                "path": None,
                "line": None,
                "side": None,
                "commit_id": review.get("commit_id"),
                "created_at": isoformat_or_none(submitted_at),
                "created_at_dt": submitted_at,
                "body": body,
                "in_reply_to_id": None,
                "review_state": review.get("state"),
                "comments": [
                    {
                        "id": review.get("id"),
                        "url": review.get("html_url"),
                        "path": None,
                        "line": None,
                        "side": None,
                        "body": body,
                        "created_at": review.get("submitted_at"),
                    }
                ],
            }
        )

    for issue_comment in issue_comments:
        user = issue_comment.get("user") or {}
        login = user.get("login")
        if not login:
            continue
        if exclude_bots and is_bot_user(user):
            continue
        if normalized_reviewer_filter and login.lower() not in normalized_reviewer_filter:
            continue
        body = extract_code_review_section(issue_comment.get("body") or "")
        if not body:
            continue
        created_at = parse_github_datetime(issue_comment.get("created_at"))
        review_events.append(
            {
                "id": issue_comment.get("id"),
                "event_id": f"issue-comment-{issue_comment.get('id')}",
                "reviewer": login,
                "source": "issue_comment",
                "url": issue_comment.get("html_url"),
                "path": None,
                "line": None,
                "side": None,
                "commit_id": None,
                "created_at": isoformat_or_none(created_at),
                "created_at_dt": created_at,
                "body": body,
                "in_reply_to_id": None,
                "comments": [
                    {
                        "id": issue_comment.get("id"),
                        "url": issue_comment.get("html_url"),
                        "path": None,
                        "line": None,
                        "side": None,
                        "body": body,
                        "created_at": issue_comment.get("created_at"),
                    }
                ],
            }
        )

    return standalone_events + review_events


def filter_recent_unique_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dated_events = [event for event in events if event.get("created_at_dt") is not None]
    if not dated_events:
        if events:
            print(
                "Warning: review events were found but none had parseable timestamps; excluding them from the recent-event window.",
                file=sys.stderr,
            )
        return []

    latest_event = max(
        dated_events,
        key=lambda item: (
            item["created_at_dt"],
            item.get("id") or 0,
        ),
    )
    window_start = latest_event["created_at_dt"] - timedelta(minutes=WINDOW_MINUTES)
    recent_events = [
        event
        for event in dated_events
        if window_start <= event["created_at_dt"] <= latest_event["created_at_dt"]
    ]

    latest_by_reviewer: dict[str, dict[str, Any]] = {}
    for event in merge_review_events(recent_events):
        reviewer = event["reviewer"]
        current = latest_by_reviewer.get(reviewer)
        if current is None or (
            event["created_at_dt"],
            event.get("id") or 0,
        ) > (
            current["created_at_dt"],
            current.get("id") or 0,
        ):
            latest_by_reviewer[reviewer] = event

    return sorted(
        latest_by_reviewer.values(),
        key=lambda item: (
            item["reviewer"].lower(),
            item["created_at_dt"],
            item.get("id") or 0,
        ),
    )


def build_grouped_payload(
    comments: list[dict[str, Any]],
    reviews: list[dict[str, Any]],
    issue_comments: list[dict[str, Any]],
    reviewer_filter: set[str],
    exclude_bots: bool,
) -> list[dict[str, Any]]:
    recent_events = filter_recent_unique_events(
        build_review_events(
            comments,
            reviews,
            issue_comments,
            reviewer_filter=reviewer_filter,
            exclude_bots=exclude_bots,
        )
    )

    reviewers = []
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in recent_events:
        grouped[event["reviewer"]].append(event)

    for reviewer in sorted(grouped.keys(), key=lambda k: k.lower()):
        reviewer_comments = sorted(
            grouped[reviewer],
            key=lambda item: (
                item.get("created_at_dt") or datetime.min.replace(tzinfo=timezone.utc),
                item.get("id") or 0,
            ),
        )
        reviewer_comments = [
            {key: value for key, value in item.items() if key != "created_at_dt"}
            for item in reviewer_comments
        ]
        reviewers.append(
            {
                "reviewer": reviewer,
                "total_comments": len(reviewer_comments),
                "comments": reviewer_comments,
            }
        )
    return reviewers


def to_markdown(repo: str, pr_number: int, reviewers: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    lines.append(f"# PR Review Comments ({repo}#{pr_number})")
    lines.append("")
    if not reviewers:
        lines.append("No review comments found.")
        return "\n".join(lines)

    for reviewer_data in reviewers:
        reviewer = reviewer_data["reviewer"]
        lines.append(f"## Reviewer: {reviewer}")
        lines.append("")
        for index, comment in enumerate(reviewer_data["comments"], start=1):
            comment_entries = comment.get("comments") or []
            first_entry = comment_entries[0] if comment_entries else comment
            path = first_entry.get("path") or "unknown-path"
            line = first_entry.get("line")
            line_text = f":{line}" if line is not None else ""
            suffix = ""
            if len(comment_entries) > 1:
                suffix = f" (+{len(comment_entries) - 1} more)"
            lines.append(f"### {index}. [{path}{line_text}]{suffix}")
            lines.append(f"- id: {comment.get('id')}")
            lines.append(f"- source: {comment.get('source')}")
            lines.append(f"- url: {comment.get('url')}")
            lines.append("")
            lines.append("Comment:")
            lines.append(comment.get("body", "").strip() or "(empty)")
            lines.append("")
        lines.append("---")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch PR review comments grouped by reviewer. "
            f"Applies a {WINDOW_MINUTES}-minute recent-event window anchored to the latest eligible event."
        )
    )
    parser.add_argument("--repo", help="GitHub repo in owner/name format.")
    parser.add_argument("--pr", type=int, help="Pull request number.")
    parser.add_argument(
        "--reviewer",
        action="append",
        default=[],
        help="Filter by reviewer login (repeatable).",
    )
    parser.add_argument(
        "--exclude-bots",
        action="store_true",
        help="Exclude bot reviewers (default: false).",
    )
    parser.add_argument(
        "--format",
        choices=["json", "markdown"],
        default="json",
        help="Output format.",
    )
    parser.add_argument(
        "--checks-timeout-seconds",
        type=int,
        default=DEFAULT_CHECKS_TIMEOUT_SECONDS,
        help=(
            f"Maximum seconds to wait for GitHub Actions checks to complete successfully "
            f"(default: {DEFAULT_CHECKS_TIMEOUT_SECONDS})."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        repo = get_repo(args.repo)
        pr_number = get_pr_number(args.pr, repo=repo)
        wait_for_actions_success(
            repo,
            pr_number,
            timeout_seconds=args.checks_timeout_seconds,
        )
        comments = fetch_all_comments(repo, pr_number)
        reviews = fetch_all_reviews(repo, pr_number)
        issue_comments = fetch_all_issue_comments(repo, pr_number)
        reviewers = build_grouped_payload(
            comments,
            reviews,
            issue_comments,
            reviewer_filter={reviewer.lower() for reviewer in args.reviewer},
            exclude_bots=args.exclude_bots,
        )

        if args.format == "markdown":
            print(to_markdown(repo, pr_number, reviewers))
            return 0

        output = {
            "repo": repo,
            "pr_number": pr_number,
            "total_comments": sum(item["total_comments"] for item in reviewers),
            "total_reviewers": len(reviewers),
            "reviewers": reviewers,
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
