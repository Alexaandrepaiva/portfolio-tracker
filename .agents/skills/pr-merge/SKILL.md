---
name: pr-merge
description: Merge a GitHub pull request from the current branch and clean up the remote branch.
metadata:
  short-description: Merge PR from current branch
---

# Merge Pull Request

## Objective

Do the correct procedure to merge a GitHub pull request from the current branch using the same merge strategy as GitHub's "Merge pull request" button (`--merge`), then delete the remote branch.

## General Guidelines

- Only go to the next step after finishing the current one.
- When this workflow calls `$commit`, override `$commit` confirmation prompts and proceed automatically.

## Instructions

1. Check whether the current branch is ahead of its remote tracking branch.

- Verify sync status with remote: run `git status -sb`.
- If the branch is ahead (e.g., `[ahead N]`), execute `git push`.

2. Run `$code-quality`.

3. Commit/push only if local changes exist.

- Check for local changes:
  - `git diff --quiet && git diff --staged --quiet`
- If there are no local changes, skip commit/push and continue.
- If there are local changes:
  - Run `$commit` in non-interactive override mode.
  - Use the generated commit message directly.
  - Push branch automatically.

4. Get PR info from current branch.

- Run:
  - `gh pr view --json number,title,mergeable,mergeStateStatus,headRefName,baseRefName,closingIssuesReferences --jq '.'`
  - If `gh pr view` fails, stop execution and report: "No open PR found for the current branch."
- From `closingIssuesReferences`, collect for each issue:
  - issue number
- For each collected issue, fetch the issue title with:
  - `gh issue view <issue-number> --json title --jq '.title'`
- Save for output:
  - PR number
  - PR title
  - Head branch name
  - Base branch name
  - Issue numbers
  - Issue titles

5. Check mergeability status (GitHub-like pre-check).

- Re-check mergeability up to 6 times (5s interval):
  - `gh pr view --json mergeable --jq '.mergeable'`
- At each retry:
  - If result is `MERGEABLE`, continue to next step.
  - If result is `CONFLICTING`, stop execution and report:
    - "PR has conflicts with base branch and cannot be merged automatically."
  - If result is `UNKNOWN`, wait 5 seconds and retry.
- If result is not `MERGEABLE` after all retries, stop execution and report current status.

6. Merge PR using `--merge` and delete the branch only after merge succeeds.

- `gh pr merge <pr-number> --merge --delete-branch`

7. Sync linked issues to Kanban `Done` (mandatory for completed work).

- For each issue in `closingIssuesReferences`:
  - `bash .agents/skills/issue/scripts/edit_issue_project_fields.sh --issue <issue-number> --status Done`
  - `gh issue close <issue-number> --comment "Closing automatically after PR merge."` (only if still open)
  - `gh issue view <issue-number> --json state,projectItems --jq '.'` and keep evidence for output.

## Output Rules

Return exactly this structure:

**Merged Pull Request**

- Name: `<pr-title>`
- Number: `<pr-number>`
- Base branch: `<base-branch>`
- Head branch: `<head-branch>`

**Linked Closing Issues**

- If linked issues exist, list each one as:
  - `#<issue-number> - <issue-title> (state: <state>, status: <project-status>)`
- If there are no linked issues, write:
  - `No linked closing issues`

**Branch Cleanup**

- Remote branch deleted: <head-branch>
