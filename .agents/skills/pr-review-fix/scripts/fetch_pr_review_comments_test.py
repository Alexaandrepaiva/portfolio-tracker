#!/usr/bin/env python3
"""Unit tests for fetch_pr_review_comments.py."""

from __future__ import annotations

import importlib.util
import json
import subprocess
from unittest import mock
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("fetch_pr_review_comments.py")
SPEC = importlib.util.spec_from_file_location("fetch_pr_review_comments", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FetchPrReviewCommentsTests(unittest.TestCase):
    def test_parse_args_uses_16_minute_checks_timeout_default(self) -> None:
        with mock.patch.object(MODULE.sys, "argv", ["fetch_pr_review_comments.py"]):
            args = MODULE.parse_args()

        self.assertEqual(
            args.checks_timeout_seconds, MODULE.DEFAULT_CHECKS_TIMEOUT_SECONDS
        )

    def test_run_gh_json_reports_missing_gh_cleanly(self) -> None:
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            side_effect=FileNotFoundError("gh not found"),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "GitHub CLI \\(`gh`\\) is not installed",
            ):
                MODULE.run_gh_json(["api", "repos/example/repo/pulls/1/comments"])

    def test_run_gh_json_reports_called_process_error(self) -> None:
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            side_effect=subprocess.CalledProcessError(
                1,
                ["gh", "api"],
                stderr="boom",
            ),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "Failed command: gh api",
            ):
                MODULE.run_gh_json(["api"])

    def test_run_gh_json_merges_paginated_json_arrays(self) -> None:
        stdout = json.dumps([{"id": 1}]) + "\n" + json.dumps([{"id": 2}])
        completed = mock.Mock(stdout=stdout)

        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            self.assertEqual(
                MODULE.run_gh_json(["api", "--paginate", "repos/example/repo/pulls/1/comments"]),
                [{"id": 1}, {"id": 2}],
            )

    def test_fetch_workflow_runs_merges_paginated_pages(self) -> None:
        head_sha = "a" * 40
        with mock.patch.object(
            MODULE,
            "run_gh_json",
            return_value=[
                {"workflow_runs": [{"id": 1}, {"id": 2}]},
                {"workflow_runs": [{"id": 3}]},
            ],
        ) as run_gh_json:
            self.assertEqual(
                MODULE.fetch_workflow_runs("owner/repo", head_sha),
                [{"id": 1}, {"id": 2}, {"id": 3}],
            )
            run_gh_json.assert_called_once_with(
                [
                    "api",
                    "--paginate",
                    f"repos/owner/repo/actions/runs?head_sha={head_sha}&per_page=100",
                ]
            )

    def test_fetch_workflow_runs_rejects_unexpected_page_payload(self) -> None:
        head_sha = "a" * 40
        with mock.patch.object(
            MODULE,
            "run_gh_json",
            return_value=[{"workflow_runs": []}, []],
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "unexpected payload for workflow runs",
            ):
                MODULE.fetch_workflow_runs("owner/repo", head_sha)

    def test_fetch_workflow_runs_rejects_invalid_head_sha(self) -> None:
        with self.assertRaisesRegex(
            ValueError,
            "Invalid workflow run head SHA format",
        ):
            MODULE.fetch_workflow_runs("owner/repo", "abc123")

    def test_extract_code_review_section_skips_bot_preamble(self) -> None:
        body = (
            "**Claude finished @thomaspmach's task in 1m 41s**\n\n"
            "---\n"
            "## Code Review\n\n"
            "### Summary\n\n"
            "The relevant review starts here."
        )

        self.assertEqual(
            MODULE.extract_code_review_section(body),
            "## Code Review\n\n### Summary\n\nThe relevant review starts here.",
        )

    def test_extract_code_review_section_accepts_html_heading(self) -> None:
        body = (
            "**Claude finished @thomaspmach's task in 1m 41s**\n\n"
            "---\n"
            "<h2>Code Review</h2>\n\n"
            "<h3>Summary</h3>\n\n"
            "The relevant review starts here."
        )

        self.assertEqual(
            MODULE.extract_code_review_section(body),
            "<h2>Code Review</h2>\n\n<h3>Summary</h3>\n\nThe relevant review starts here.",
        )

    def test_build_grouped_payload_includes_timeline_code_review_comments(self) -> None:
        issue_comments = [
            {
                "id": 4017411645,
                "user": {"login": "claude"},
                "html_url": "https://github.com/example/repo/pull/1#issuecomment-4017411645",
                "body": (
                    "**Claude finished @thomaspmach's task in 1m 41s**\n\n"
                    "---\n"
                    "## Code Review\n\n"
                    "### Summary\n\n"
                    "A few noteworthy issues remain."
                ),
                "created_at": "2026-03-07T21:27:55Z",
            }
        ]

        grouped = MODULE.build_grouped_payload(
            comments=[],
            reviews=[],
            issue_comments=issue_comments,
            reviewer_filter=set(),
            exclude_bots=False,
        )

        self.assertEqual(len(grouped), 1)
        self.assertEqual(grouped[0]["reviewer"], "claude")
        self.assertEqual(grouped[0]["total_comments"], 1)
        self.assertEqual(grouped[0]["comments"][0]["source"], "issue_comment")
        self.assertTrue(grouped[0]["comments"][0]["body"].startswith("## Code Review"))

    def test_build_review_events_includes_standalone_review_comments(self) -> None:
        events = MODULE.build_review_events(
            comments=[
                {
                    "id": 4,
                    "user": {"login": "reviewer", "type": "User"},
                    "html_url": "https://github.com/example/repo/pull/1#discussion_r4",
                    "path": "file.py",
                    "line": 22,
                    "side": "RIGHT",
                    "commit_id": "abc",
                    "body": "Standalone comment",
                    "created_at": "2026-03-07T21:01:00Z",
                }
            ],
            reviews=[],
            issue_comments=[],
            reviewer_filter=set(),
            exclude_bots=False,
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source"], "review_comment")
        self.assertEqual(
            MODULE.format_comment_entry(events[0]["comments"][0]),
            "[file.py:22]\nStandalone comment",
        )

    def test_build_review_events_respects_reviewer_filter_and_exclude_bots(self) -> None:
        comments = [
            {
                "id": 1,
                "pull_request_review_id": 99,
                "user": {"login": "claude[bot]", "type": "Bot"},
                "html_url": "https://github.com/example/repo/pull/1#discussion_r1",
                "path": "file.py",
                "line": 10,
                "side": "RIGHT",
                "commit_id": "abc",
                "body": "bot comment",
                "created_at": "2026-03-07T21:00:00Z",
            }
        ]
        reviews = [
            {
                "id": 2,
                "user": {"login": "reviewer", "type": "User"},
                "html_url": "https://github.com/example/repo/pull/1#pullrequestreview-2",
                "body": "## Code Review\n\nReview body",
                "submitted_at": "2026-03-07T21:05:00Z",
                "commit_id": "def",
                "state": "COMMENTED",
            }
        ]
        issue_comments = [
            {
                "id": 3,
                "user": {"login": "other-reviewer", "type": "User"},
                "html_url": "https://github.com/example/repo/pull/1#issuecomment-3",
                "body": "## Code Review\n\nIssue review body",
                "created_at": "2026-03-07T21:06:00Z",
            }
        ]

        events = MODULE.build_review_events(
            comments=comments,
            reviews=reviews,
            issue_comments=issue_comments,
            reviewer_filter={"reviewer"},
            exclude_bots=True,
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["reviewer"], "reviewer")
        self.assertEqual(events[0]["source"], "review")

    def test_build_review_events_matches_reviewer_filter_case_insensitively(self) -> None:
        events = MODULE.build_review_events(
            comments=[],
            reviews=[
                {
                    "id": 2,
                    "user": {"login": "octocat", "type": "User"},
                    "html_url": "https://github.com/example/repo/pull/1#pullrequestreview-2",
                    "body": "## Code Review\n\nReview body",
                    "submitted_at": "2026-03-07T21:05:00Z",
                    "commit_id": "def",
                    "state": "COMMENTED",
                }
            ],
            issue_comments=[],
            reviewer_filter={"octocat".upper()},
            exclude_bots=False,
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["reviewer"], "octocat")

    def test_filter_recent_unique_events_keeps_latest_per_reviewer_and_excludes_old_events(self) -> None:
        events = [
            {
                "id": 1,
                "reviewer": "alice",
                "created_at_dt": MODULE.parse_github_datetime("2026-03-07T20:55:00Z"),
            },
            {
                "id": 2,
                "reviewer": "alice",
                "created_at_dt": MODULE.parse_github_datetime("2026-03-07T21:10:00Z"),
            },
            {
                "id": 3,
                "reviewer": "bob",
                "created_at_dt": MODULE.parse_github_datetime("2026-03-07T21:12:00Z"),
            },
        ]

        filtered = MODULE.filter_recent_unique_events(events)

        self.assertEqual([event["id"] for event in filtered], [2, 3])

    def test_filter_recent_unique_events_includes_25_minute_event_with_30_minute_window(self) -> None:
        events = [
            {
                "id": 1,
                "reviewer": "carol",
                "created_at_dt": MODULE.parse_github_datetime("2026-03-07T20:41:00Z"),
            },
            {
                "id": 2,
                "reviewer": "alice",
                "created_at_dt": MODULE.parse_github_datetime("2026-03-07T20:47:00Z"),
            },
            {
                "id": 3,
                "reviewer": "bob",
                "created_at_dt": MODULE.parse_github_datetime("2026-03-07T21:12:00Z"),
            },
        ]

        filtered = MODULE.filter_recent_unique_events(events)

        self.assertEqual([event["id"] for event in filtered], [2, 3])

    def test_filter_recent_unique_events_merges_same_review_before_reviewer_dedup(self) -> None:
        timestamp_a = MODULE.parse_github_datetime("2026-03-08T00:35:00Z")
        timestamp_b = MODULE.parse_github_datetime("2026-03-08T00:36:00Z")
        filtered = MODULE.filter_recent_unique_events(
            [
                {
                    "id": 10,
                    "review_group_id": 10,
                    "reviewer": "claude[bot]",
                    "source": "review_comment",
                    "created_at_dt": timestamp_a,
                    "created_at": "2026-03-08T00:35:00Z",
                    "body": "[file.py:10]\nInline finding",
                    "comments": [
                        {
                            "id": 100,
                            "url": "inline",
                            "path": "file.py",
                            "line": 10,
                            "body": "Inline finding",
                            "created_at": "2026-03-08T00:35:00Z",
                        }
                    ],
                },
                {
                    "id": 10,
                    "review_group_id": 10,
                    "reviewer": "claude[bot]",
                    "source": "review",
                    "created_at_dt": timestamp_b,
                    "created_at": "2026-03-08T00:36:00Z",
                    "body": "## Code Review\n\nTop-level finding",
                    "comments": [
                        {
                            "id": 10,
                            "url": "review",
                            "body": "## Code Review\n\nTop-level finding",
                            "created_at": "2026-03-08T00:36:00Z",
                        }
                    ],
                },
            ]
        )

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["source"], "review")
        self.assertEqual(len(filtered[0]["comments"]), 2)
        self.assertIn("Inline finding", filtered[0]["body"])
        self.assertIn("Top-level finding", filtered[0]["body"])

    def test_merge_review_events_keeps_standalone_review_comments_distinct(self) -> None:
        merged = MODULE.merge_review_events(
            [
                {
                    "id": 10,
                    "reviewer": "reviewer",
                    "source": "review_comment",
                    "created_at_dt": MODULE.parse_github_datetime("2026-03-08T00:35:00Z"),
                    "created_at": "2026-03-08T00:35:00Z",
                    "body": "[file.py:10]\nStandalone comment",
                    "comments": [
                        {
                            "id": 100,
                            "url": "standalone",
                            "body": "Standalone comment",
                            "created_at": "2026-03-08T00:35:00Z",
                        }
                    ],
                },
                {
                    "id": 10,
                    "review_group_id": 10,
                    "reviewer": "reviewer",
                    "source": "review",
                    "created_at_dt": MODULE.parse_github_datetime("2026-03-08T00:36:00Z"),
                    "created_at": "2026-03-08T00:36:00Z",
                    "body": "## Code Review\n\nTop-level review",
                    "comments": [
                        {
                            "id": 10,
                            "url": "review",
                            "body": "## Code Review\n\nTop-level review",
                            "created_at": "2026-03-08T00:36:00Z",
                        }
                    ],
                },
            ]
        )

        self.assertEqual(len(merged), 2)
        self.assertEqual({event["source"] for event in merged}, {"review", "review_comment"})

    def test_merge_review_events_deduplicates_comments_and_preserves_review_source(self) -> None:
        merged = MODULE.merge_review_events(
            [
                {
                    "id": 10,
                    "review_group_id": 10,
                    "reviewer": "reviewer",
                    "source": "review",
                    "created_at_dt": MODULE.parse_github_datetime("2026-03-08T00:36:00Z"),
                    "created_at": "2026-03-08T00:36:00Z",
                    "body": "## Code Review\n\nTop-level review",
                    "comments": [
                        {
                            "id": 10,
                            "url": "review",
                            "body": "## Code Review\n\nTop-level review",
                            "created_at": "2026-03-08T00:36:00Z",
                        }
                    ],
                },
                {
                    "id": 10,
                    "reviewer": "reviewer",
                    "source": "review",
                    "created_at_dt": MODULE.parse_github_datetime("2026-03-08T00:36:00Z"),
                    "created_at": "2026-03-08T00:36:00Z",
                    "body": "## Code Review\n\nTop-level review",
                    "comments": [
                        {
                            "id": 10,
                            "url": "review",
                            "body": "## Code Review\n\nTop-level review",
                            "created_at": "2026-03-08T00:36:00Z",
                        }
                    ],
                },
                {
                    "id": 10,
                    "review_group_id": 10,
                    "reviewer": "reviewer",
                    "source": "review_comment",
                    "created_at_dt": MODULE.parse_github_datetime("2026-03-08T00:35:00Z"),
                    "created_at": "2026-03-08T00:35:00Z",
                    "body": "[file.py:10]\nInline finding",
                    "comments": [
                        {
                            "id": 100,
                            "url": "inline",
                            "body": "Inline finding",
                            "created_at": "2026-03-08T00:35:00Z",
                        }
                    ],
                },
            ]
        )

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["source"], "review")
        self.assertEqual(len(merged[0]["comments"]), 2)
        self.assertEqual(merged[0]["body"].count("Top-level review"), 1)

    def test_filter_recent_unique_events_returns_empty_when_all_events_are_undated(self) -> None:
        with mock.patch.object(MODULE.sys, "stderr"):
            self.assertEqual(
                MODULE.filter_recent_unique_events(
                    [{"id": 1, "reviewer": "alice", "created_at_dt": None}]
                ),
                [],
            )

    def test_filter_recent_unique_events_uses_id_as_tiebreaker(self) -> None:
        timestamp = MODULE.parse_github_datetime("2026-03-07T21:10:00Z")
        filtered = MODULE.filter_recent_unique_events(
            [
                {"id": 1, "reviewer": "alice", "created_at_dt": timestamp},
                {"id": 2, "reviewer": "alice", "created_at_dt": timestamp},
            ]
        )

        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["id"], 2)

    def test_get_current_branch_reports_missing_git_cleanly(self) -> None:
        with mock.patch.object(
            MODULE.subprocess,
            "run",
            side_effect=FileNotFoundError("git not found"),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "Git is not installed or not available on PATH.",
            ):
                MODULE.get_current_branch()

    def test_get_current_branch_rejects_unsafe_branch_names(self) -> None:
        completed = mock.Mock(stdout="--json\n")
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(
                RuntimeError,
                "Invalid branch format",
            ):
                MODULE.get_current_branch()

    def test_get_current_branch_rejects_double_dot_substrings(self) -> None:
        completed = mock.Mock(stdout="feature..test\n")
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(
                RuntimeError,
                "must not contain '\\.\\.'|must not contain '..'",
            ):
                MODULE.get_current_branch()

    def test_get_pr_number_uses_detached_head_fallback(self) -> None:
        with mock.patch.object(
            MODULE,
            "get_current_branch",
            side_effect=RuntimeError(MODULE.DETACHED_HEAD_ERROR),
        ), mock.patch.object(
            MODULE,
            "run_gh_json",
            return_value={"number": 42},
        ) as run_gh_json:
            self.assertEqual(MODULE.get_pr_number(None, repo="owner/repo"), 42)
            run_gh_json.assert_called_once_with(
                ["pr", "view", "--repo", "owner/repo", "--json", "number"]
            )

    def test_get_pr_number_raises_explicit_error_when_detached_head_fallback_fails(self) -> None:
        with mock.patch.object(
            MODULE,
            "get_current_branch",
            side_effect=RuntimeError(MODULE.DETACHED_HEAD_ERROR),
        ), mock.patch.object(
            MODULE,
            "run_gh_json",
            side_effect=RuntimeError("boom"),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "Current branch is detached, and GitHub CLI could not infer the PR",
            ):
                MODULE.get_pr_number(None, repo="owner/repo")

    def test_get_pr_number_uses_branch_list_path(self) -> None:
        with mock.patch.object(
            MODULE,
            "get_current_branch",
            return_value="feature/test",
        ), mock.patch.object(
            MODULE,
            "run_gh_json",
            return_value=[{"number": 42}],
        ) as run_gh_json:
            self.assertEqual(MODULE.get_pr_number(None, repo="owner/repo"), 42)
            run_gh_json.assert_called_once_with(
                [
                    "pr",
                    "list",
                    "--repo",
                    "owner/repo",
                    "--head",
                    "feature/test",
                    "--json",
                    "number",
                    "--limit",
                    "1",
                ]
            )

    def test_get_pr_number_raises_when_branch_list_returns_no_pr(self) -> None:
        with mock.patch.object(
            MODULE,
            "get_current_branch",
            return_value="feature/test",
        ), mock.patch.object(
            MODULE,
            "run_gh_json",
            return_value=[],
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "No PR found for branch 'feature/test' in repository 'owner/repo'",
            ):
                MODULE.get_pr_number(None, repo="owner/repo")

    def test_get_repo_rejects_invalid_repo_format(self) -> None:
        with self.assertRaisesRegex(
            RuntimeError,
            "Invalid repository format",
        ):
            MODULE.get_repo("owner/repo/../../../other")

    def test_wait_for_actions_success_returns_when_all_runs_succeed(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "completed",
                    "conclusion": "success",
                    "pull_requests": [{"number": 42}],
                }
            ],
        ) as fetch_runs:
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )
            fetch_runs.assert_called_once_with("owner/repo", "a" * 40)

    def test_wait_for_actions_success_returns_when_run_is_skipped(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "Claude Code",
                    "run_number": 17,
                    "status": "completed",
                    "conclusion": "skipped",
                    "pull_requests": [{"number": 42}],
                }
            ],
        ) as fetch_runs:
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )
            fetch_runs.assert_called_once_with("owner/repo", "a" * 40)

    def test_wait_for_actions_success_waits_until_run_completes(self) -> None:
        workflow_runs_responses = [
            [
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "in_progress",
                    "conclusion": None,
                    "pull_requests": [{"number": 42}],
                }
            ],
            [
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "completed",
                    "conclusion": "success",
                    "pull_requests": [{"number": 42}],
                }
            ],
        ]

        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40}},
        ) as fetch_pr, mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            side_effect=workflow_runs_responses,
        ) as fetch_runs, mock.patch.object(
            MODULE.time,
            "sleep",
        ) as sleep, mock.patch.object(
            MODULE.time,
            "monotonic",
            side_effect=[0.0, 0.0, 1.0],
        ):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )
            self.assertEqual(fetch_runs.call_count, 2)
            sleep.assert_called_once()
            fetch_pr.assert_called_once_with("owner/repo", 42)

    def test_wait_for_actions_success_raises_on_failed_run(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "completed",
                    "conclusion": "failure",
                    "pull_requests": [{"number": 42}],
                }
            ],
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "did not all succeed or skip",
            ):
                MODULE.wait_for_actions_success(
                    "owner/repo",
                    42,
                    timeout_seconds=30,
                    poll_interval_seconds=1,
                )

    def test_wait_for_actions_success_raises_on_cancelled_run(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "completed",
                    "conclusion": "cancelled",
                    "pull_requests": [{"number": 42}],
                }
            ],
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "did not all succeed or skip",
            ):
                MODULE.wait_for_actions_success(
                    "owner/repo",
                    42,
                    timeout_seconds=30,
                    poll_interval_seconds=1,
                )

    def test_wait_for_actions_success_raises_on_timed_out_run(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "completed",
                    "conclusion": "timed_out",
                    "pull_requests": [{"number": 42}],
                }
            ],
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "did not all succeed or skip",
            ):
                MODULE.wait_for_actions_success(
                    "owner/repo",
                    42,
                    timeout_seconds=30,
                    poll_interval_seconds=1,
                )

    def test_wait_for_actions_success_raises_on_timeout(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "in_progress",
                    "conclusion": None,
                    "pull_requests": [{"number": 42}],
                }
            ],
        ), mock.patch.object(
            MODULE.time,
            "monotonic",
            side_effect=[0.0, 0.0, 31.0],
        ), mock.patch.object(
            MODULE.time,
            "sleep",
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "Timed out waiting for GitHub Actions checks",
            ):
                MODULE.wait_for_actions_success(
                    "owner/repo",
                    42,
                    timeout_seconds=30,
                    poll_interval_seconds=1,
                )

    def test_wait_for_actions_success_ignores_runs_for_other_prs(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40, "ref": "feature-branch"}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "status": "completed",
                    "conclusion": "failure",
                    "pull_requests": [{"number": 99}],
                }
            ],
        ), mock.patch.object(MODULE.sys, "stderr"):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

    def test_wait_for_actions_success_accepts_unlinked_pr_event_runs_on_head_branch(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40, "ref": "feature-branch"}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "event": "pull_request",
                    "head_branch": "feature-branch",
                    "status": "completed",
                    "conclusion": "success",
                    "pull_requests": [],
                }
            ],
        ):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

    def test_wait_for_actions_success_ignores_unlinked_push_runs_on_head_branch(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40, "ref": "feature-branch"}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[
                {
                    "name": "CI",
                    "run_number": 17,
                    "event": "push",
                    "head_branch": "feature-branch",
                    "status": "completed",
                    "conclusion": "failure",
                    "pull_requests": [],
                }
            ],
        ), mock.patch.object(MODULE.sys, "stderr"):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

    def test_wait_for_actions_success_warns_and_proceeds_when_no_relevant_runs_found(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40, "ref": "feature-branch"}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[],
        ), mock.patch.object(
            MODULE.time,
            "monotonic",
            side_effect=[0.0, 0.0, 1.0, 2.0],
        ), mock.patch.object(
            MODULE.time,
            "sleep",
        ), mock.patch.object(MODULE.sys, "stderr"):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

    def test_wait_for_actions_success_retries_before_warning_when_no_relevant_runs_found(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "a" * 40, "ref": "feature-branch"}},
        ), mock.patch.object(
            MODULE,
            "fetch_workflow_runs",
            return_value=[],
        ) as fetch_runs, mock.patch.object(
            MODULE.time,
            "monotonic",
            side_effect=[0.0, 0.0, 1.0, 2.0],
        ), mock.patch.object(
            MODULE.time,
            "sleep",
        ) as sleep, mock.patch.object(MODULE.sys, "stderr"):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=1,
            )

            self.assertEqual(fetch_runs.call_count, MODULE.NO_RELEVANT_RUNS_RETRY_LIMIT + 1)
            self.assertEqual(sleep.call_count, MODULE.NO_RELEVANT_RUNS_RETRY_LIMIT)

    def test_wait_for_actions_success_raises_for_missing_head_sha(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "   ", "ref": "feature-branch"}},
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "has no valid head SHA",
            ):
                MODULE.wait_for_actions_success(
                    "owner/repo",
                    42,
                    timeout_seconds=30,
                    poll_interval_seconds=1,
                )

    def test_wait_for_actions_success_raises_for_invalid_head_sha_format(self) -> None:
        with mock.patch.object(
            MODULE,
            "fetch_pr",
            return_value={"head": {"sha": "abc123", "ref": "feature-branch"}},
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                "invalid head SHA format",
            ):
                MODULE.wait_for_actions_success(
                    "owner/repo",
                    42,
                    timeout_seconds=30,
                    poll_interval_seconds=1,
                )

    def test_wait_for_actions_success_rejects_non_positive_timeout(self) -> None:
        with self.assertRaisesRegex(
            RuntimeError,
            "Checks timeout must be greater than zero seconds",
        ):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=0,
                poll_interval_seconds=1,
            )

    def test_wait_for_actions_success_rejects_non_positive_poll_interval(self) -> None:
        with self.assertRaisesRegex(
            RuntimeError,
            "Checks poll interval must be greater than zero seconds",
        ):
            MODULE.wait_for_actions_success(
                "owner/repo",
                42,
                timeout_seconds=30,
                poll_interval_seconds=0,
            )


if __name__ == "__main__":
    unittest.main()
