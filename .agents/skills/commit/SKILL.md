---
name: commit
description: Create a git commit using Conventional Commits after reviewing staged changes and using the generated message. Use when the user asks to commit.
metadata:
  short-description: Commit changes
---

# Commit

## Objective

Generate a commit message summarizing and committing the current git changes.

## Instructions

The agent must automatically:

0. Prepare staging before commit:
   - If the user **already has staged files**, do nothing.
   - If there are **no staged files**, stage all changes automatically:  
     Run: `git add -A`

1. Detect all relevant changes:
   - Use `git diff --staged` to read all staged changes and determine what changed and the nature of each modification.
   - If `git diff --staged` is empty, stop and report: **"No staged changes found; nothing to commit."**

2. Create a commit message:
   - Types: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`, `ci`, `build`, `style`, `agents`
   - Use `agents` when changes affect agent/automation/skill behavior or prompts
   - Optional scope: `(module-name)`
   - Format: `type(scope?): message`
   - Use a body only when needed (explain _what_ and _why_)
   - Avoid vague or redundant wording.

3. Commit using the generated commit message.

4. After the commit is created:
   - Show the commit hash and the commit message
   - Ask explicitly:  
     **"Do you want to push this commit now?"**
   - Push **only if the user explicitly agrees** (`git push`)

## Output Rules

- First: Prepare staging (stage all changes if none are staged).
- Then: Detect staged changes; if none exist, stop and report: **"No staged changes found; nothing to commit."**
- Then: Generate the commit message.
- Then: Commit using the generated message.
- Then: Show the commit hash and commit message.
- Then ask explicitly: **"Do you want to push this commit now?"**
- Push only after explicit approval.
