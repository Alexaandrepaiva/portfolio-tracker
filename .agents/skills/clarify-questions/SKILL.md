---
name: clarify-questions
description: If needed, AI ask question to clarify task requirements before implementing. Do not use automatically, only when invoked explicitly.
metadata:
  short-description: (TASK) If needed, AI ask question to clarify task requirements before implementing
---

# Clarify Questions

## Goal

Ask the minimum set of clarifying questions needed to avoid wrong work; do not start implementing until the must-have questions are answered (or the user explicitly approves proceeding with stated assumptions).

## Workflow

### 1) Decide whether the request is underspecified

Treat a request as underspecified if after exploring how to perform the work, some or all of the following are not clear:

- Define the objective (what should change vs stay the same)
- Define "done" (acceptance criteria, examples, edge cases)
- Define scope (which files/components/users are in/out)
- Define constraints (compatibility, performance, style, deps, time)
- Identify environment (language/runtime versions, OS, build/test runner)
- Clarify safety/reversibility (data migration, rollout/rollback, risk)

If multiple plausible interpretations exist, assume it is underspecified.

### 2) Ask must-have questions first with `request_user_input`

If the Codex `request_user_input` tool is available, use it for the first clarification pass. Keep it to 1-3 short questions because the tool supports at most 3 questions. Prefer questions that eliminate whole branches of work.

If `request_user_input` is unavailable in the current environment or mode, ask the same minimum clarification questions as a normal message instead of blocking on the tool.

Build each tool question so it is easy to answer:

- Keep the prompt to a single sentence
- Use a short header label (12 characters or fewer)
- Use a unique and stable `snake_case` id
- Offer 2-3 mutually exclusive choices
- Put the recommended/default choice first and label it with `(Recommended)`
- Use the option description to explain the tradeoff in one sentence
- Include a low-friction fallback such as "Use default" or "Not sure" when helpful

Prefer grouping ambiguity into a few decisive questions instead of many small ones. Ask only what is required to safely proceed.

Example tool shape:

```json
{
  "questions": [
    {
      "header": "Scope",
      "id": "scope",
      "question": "What scope should I use for this change?",
      "options": [
        {
          "label": "Minimal (Recommended)",
          "description": "Touch only what is necessary to complete the request."
        },
        {
          "label": "Refactor too",
          "description": "Allow cleanup in the same area if it improves the result."
        },
        {
          "label": "Not sure",
          "description": "Proceed with the safest default choice."
        }
      ]
    }
  ]
}
```

After the user responds, restate the selected options in plain language before implementing.

### 3) Pause before acting

Until must-have answers arrive:

- Do not run commands, edit files, or produce a detailed plan that depends on unknowns
- Do perform a clearly labeled, low-risk discovery step only if it does not commit you to a direction (e.g., inspect repo structure, read relevant config files)

If the user explicitly asks you to proceed without answers:

- State your assumptions as a short numbered list
- Ask for confirmation; proceed only after they confirm or correct them

### 4) Confirm interpretation, then proceed

Once you have answers, restate the requirements in 1-3 sentences (including key constraints and what success looks like), then start work.

## When to fall back to a normal message

Use a normal textual question if `request_user_input` is unavailable or if it cannot express what is needed well enough, such as:

- The user must provide free-form text, code, or a URL
- The answer space cannot be reduced to 2-3 meaningful options
- A follow-up depends on interpreting a previous open-ended answer

When falling back, keep the same spirit: ask the minimum set of concrete questions, offer an easy defaults path such as "Use defaults" when helpful, and make the easiest safe assumption explicit.

## Anti-patterns

- Don't ask questions you can answer with a quick, low-risk discovery read (e.g., configs, existing patterns, docs).
- Don't ask open-ended questions if a tight multiple-choice or yes/no would eliminate ambiguity faster.
- Don't ask more than 3 questions in one `request_user_input` call.
- Don't use `request_user_input` when the real need is free-form input and the options would be fake or misleading.
