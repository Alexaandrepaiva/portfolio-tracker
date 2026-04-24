---
name: code-quality
description: Run code quality checks and fix issues. Activates when the user wants to improve code quality.
metadata:
  short-description: Fix code quality issues
---

# Code Quality

## Objective

Run code quality checks and fix issues.

## Instructions

### Detect code changes

1. Fetch base ref:
   - `git fetch origin`
2. Compare changes:
   - If working tree is clean:
     - `git diff --name-status origin/main...HEAD`
   - If working tree has uncommitted changes, include local changes too:
     - `git diff --name-status`
     - `git diff --name-status origin/main...HEAD`

### Build file list for lint/format

1. Collect diff files (local + branch) and normalize:
   - PowerShell:
     - `$files = @()`
     - `$files += git diff --name-only`
     - `$files += git diff --name-only origin/main...HEAD`
     - `$files = $files | Sort-Object -Unique`
   - Bash/Zsh:
     - `files=$( { git diff --name-only; git diff --name-only origin/main...HEAD; } | sort -u )`
2. Filter only code files and lint/format configs:
   - PowerShell:
     - `$codeFiles = $files | Where-Object { $_ -match '\\.(ts|tsx|js|jsx)$' }`
     - `$configFiles = $files | Where-Object { $_ -match '\\.(eslintrc\\.(json|js|cjs|yaml|yml)|prettierrc(\\.json|\\.js|\\.cjs|\\.yaml|\\.yml)?|prettierignore)$' }`
   - Bash/Zsh:
     - `code_files=$(printf "%s\n" "$files" | grep -E '\\.(ts|tsx|js|jsx)$' || true)`
     - `config_files=$(printf "%s\n" "$files" | grep -E '\\.(eslintrc\\.(json|js|cjs|yaml|yml)|prettierrc(\\.json|\\.js|\\.cjs|\\.yaml|\\.yml)?|prettierignore)$' || true)`

### Conditional rules

1. **No code changes** (docs, copy, comments, assets only):
   - Do not run checks; report that no checks were required.

2. **Code changes in `.ts/.tsx/.js/.jsx` or lint/format config files**:
   - PowerShell:
     - `$lintTargets = @($codeFiles) + @($configFiles)`
     - If `$lintTargets` is empty, skip lint/format and report that no code/config files changed.
     - Run: `npx eslint --fix $lintTargets`
     - Run: `npx prettier --write $lintTargets`
   - Bash/Zsh:
     - `lint_targets=$(printf "%s\n" "$code_files" "$config_files" | sed '/^$/d')`
     - If `lint_targets` is empty, skip lint/format and report that no code/config files changed.
     - Run: `npx eslint --fix $lint_targets`
     - Run: `npx prettier --write $lint_targets`

3. **TypeScript changes** (any `.ts/.tsx` in app code, shared types, or Prisma types):
   - Run: `npx tsc --noEmit`
   - Revert any files changed by `tsc` that are not part of the diff file list (local + branch).

4. **Business logic / validations / serializers / helpers / multi-layer changes**:
   - Run: `npm run test`
   - If any test fails, fix the issues and run the command again. Do not stop until all tests pass.

## Output Rules

- Report which checks ran and why.
- If any check failed, show the failure and fix summary.
