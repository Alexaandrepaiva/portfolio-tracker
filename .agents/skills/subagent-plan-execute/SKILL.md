---
name: subagent-plan-execute
description: Execute an approved plan in a separate thread by handing the full plan to a single `plan_executor` subagent, waiting for completion, and reporting the final execution summary back in the main thread. Use when the user wants plan execution isolated from the planning conversation.
metadata:
  short-description: Execute a plan in one plan_executor subagent
---

# Subagent Plan Execute

## Objective

Run an approved plan in a separate subagent thread while keeping the main thread focused on orchestration and final reporting.

## Expected input

- A complete approved plan, usually produced in plan mode
- Any extra context required to execute the plan safely

## Instructions

### 1) Validate the handoff

- Confirm the plan is complete enough to execute without reopening brainstorming.
- If the plan is still missing key decisions, stop and ask for those decisions before spawning a subagent.
- Treat the approved plan as the source of intent and expected outcomes.
- When the plan requests manual/UI validation, confirm it includes runnable details (URL/route and expected observations). If not, stop and ask for the missing details before spawning.

### 2) Create one execution subagent

- Spawn exactly one `plan_executor` subagent for the full execution.
- Do not split the plan across multiple subagents unless the user explicitly asks for parallel execution.
- Keep orchestration in the main thread. The subagent owns execution; the main agent owns handoff, waiting, and final reporting.
- Use the role config to set model and reasoning. Do not pass `model` or `reasoning_effort` in the `spawn_agent` call unless the user explicitly asks for an override in the current run.
- Do not pass `fork_context`; build the handoff context explicitly in the message instead.

### 3) Build the handoff package

- Pass the full approved plan verbatim.
- Include any required repository, branch, environment, or validation context that is not already obvious from the current thread.
- If the plan includes manual/UI/browser validation, make it mandatory in the handoff: explicit URL/route checks, and `browser-test` execution for validation evidence.
- Keep the handoff self-contained so the subagent does not need `fork_context`.

Use this handoff structure:

```text
You are executing an approved plan in a separate thread.

Plan to execute:
[full approved plan]

Extra context:
[only the extra execution context that is actually needed]
```

### 4) Wait for execution to finish

- Wait for the subagent result when this skill is used; the user asked for delegated execution, not just setup.
- Do not redo the execution work in the main thread while the subagent is running.
- If the subagent reports a blocker that requires user input or a risky decision, surface that clearly in the main thread.

### 5) Report back in the main thread

- Make it clear that the execution happened in a separate subagent thread.
- Preserve the subagent's final status: `completed`, `partially completed`, or `blocked`.
- Return a concise execution summary in the main thread after the subagent finishes.
- Summarize completed work, validations, deviations, and remaining blockers or risks.

## Output Rules

- Keep the final main-thread report concise and execution-focused.
- Do not dump the full internal subagent conversation unless the user asks for it.
- If the subagent completed successfully, emphasize outcomes and validation.
- If the subagent was blocked, emphasize the concrete blocker and the smallest next decision needed from the user.
