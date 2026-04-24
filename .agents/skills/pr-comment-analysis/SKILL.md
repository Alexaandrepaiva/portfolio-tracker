---
name: pr-comment-analysis
description: Analyze PR review comments and propose high-level fixes; use when the user provides PR feedback and wants validity, impact, and next-step guidance without generating code.
metadata:
  short-description: (COMMENTS) Analyze PR review comments and suggest fixes
---

# PR Comment Review

## Expected input

- <COMMENTS>: The pull request review comments to analyze.

## Objective

Analyze and suggest fixes for each pull request review comment presented in <COMMENTS>.

## Instructions

1. Check the files changed and the codebase to determine whether the comment makes sense or not.
2. Explain **why** the comment is valid, partially valid, or invalid.
3. You **may suggest fixes or next steps**, but **must not generate or write code**.
4. Do not modify any files.
5. Output the analysis as an **enumerated list**, where each number corresponds to the order of the comments.
6. The output language must be in English.
7. Use the Output format below for each comment.

## Output format

**N. Comment: Summarize the comment in one line**

**Analysis**
Explain your assessment.

**Suggested Fix**
Provide high-level guidance only.  
If no changes are needed, explicitly state: **"No changes needed."**
