---
name: browser-test
description: >-
  Start the local app stack in one flow: run Next.js dev server with
  npm run dev, start the pinned Inngest worker only when the manual validation
  flow depends on an async effect mediated by Inngest, and open `/demo-login`
  in agent-browser to authenticate the session, then execute all plan-specific
  browser checks inside this same workflow. Use when the user asks to do
  browser manual validation.
---

# Browser Test

## Overview

Workflow to browser manual validation.

## Rules

- The selected app port must be read from Next.js output (`Local: http://localhost:<port>`) and reused in all following steps.
- Persistent mode for this skill is mandatory and means long-lived PTY sessions (`exec_command` + `write_stdin`) for each service.
- Start Inngest only when the manual validation flow depends on an async effect mediated by Inngest. If the validation is limited to render, navigation, layout, or other synchronous behavior that does not depend on Inngest-mediated background work, do not start it.
- Never use `nohup`, `disown`, `setsid`, or relaunch migration patterns to "convert" an already-running service.
- Never launch Inngest with `npx --yes ...@latest` or any other floating remote package execution pattern; use the pinned repo script instead.
- This workflow MUST use `agent-browser` cli for all browser interactions. For usage instructions, see the $agent-browser skill.

## Instructions

The browser-test flow must do exactly this:

1. Run `npm run dev` in a PTY session and wait for the Next.js `Local` URL log line before continuing.
2. Treat the `Local:` capture as a required readiness milestone: poll PTY output for up to 120 seconds, then abort and report the visible error if the line never appears.
3. After the `Local:` line is present, run `curl -sS --max-time 5 --max-redirs 0 -o /dev/null -w '%{http_code}' http://localhost:<port>/demo-login` every 5 seconds for up to 60 seconds and require `200` before opening the browser.
   Note: this readiness check intentionally validates only the Next.js app endpoint. If Inngest is required for the manual validation flow (as decided in step 4), its readiness is verified in steps 4-5.
4. If and only if the manual validation flow depends on an async effect mediated by Inngest, run `npm run inngest:dev -- -u http://localhost:<port>/api/inngest` in its own PTY session.
5. When step 4 applies, confirm Inngest readiness from PTY output before reporting it as started. Accept explicit success lines such as `Registered`, `Connected`, or equivalent function-registration output; if those do not appear within 60 seconds, abort and report Inngest as not ready.
6. Keep every started service in its PTY session for the rest of the run; do not switch to `nohup`, `disown`, or other detach mechanisms.
7. Open `http://localhost:<port>/demo-login` with $agent-browser only after the app readiness check passes, to confirm page readiness only (do not submit credentials in this step).
8. Report startup success if `http://localhost:<port>/demo-login` returned `200` during the readiness polling step.
9. Before login, preflight credentials:
   - If `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD` are already in process environment, continue.
   - Otherwise, resolve the repository root (for example, with `git rev-parse --show-toplevel`) and read `<repo-root>/.env` via absolute path. Parse only `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD` as raw dotenv `KEY=VALUE` strings (no shell evaluation/interpolation/command substitution) and export only the missing variable(s). Preserve any value already present in process environment; do not overwrite it. Do not use `source .env`.
   - Re-check both variables and abort with a blocker if either is missing or empty.
   - Normalize credentials before typing in the browser: trim leading/trailing whitespace from both values, and use these normalized values as the exact inputs sent in the agent-browser fill/type commands.
10. On the already-open `/demo-login` page, enter the normalized `DEMO_LOGIN_EMAIL` and `DEMO_LOGIN_PASSWORD`, then submit the login form.
11. After authentication, execute browser validation on the exact routes and checks defined in the user-provided plan within this same `browser-test` run.

### Startup Contract (Strict)

1. Verify app readiness only after the `Local:` line appears, reusing the exact readiness check defined in step 3 (`/demo-login`, 5-second polling, up to 60 seconds, require `200`).
2. Apply at most one safe retry to the app readiness polling only when `curl` fails with a transient connection error or non-`200` status and the PTY output does not show a compile error, port conflict, or missing-environment failure. The safe retry is: wait 10 seconds, then repeat the same 60-second readiness polling window once.
3. Do not retry when the PTY output shows a compile error, port conflict, missing env var, or another deterministic startup failure. Abort and report the relevant PTY evidence instead.
4. Do not restart `npm run dev` or Inngest automatically as part of the safe retry path; the retry covers readiness polling only.
5. When the validation flow requires Inngest, treat it as healthy only after its PTY output shows an explicit registration/connection success signal. If startup output shows an error instead, abort and report that error without retrying silently.

## Output Requirements

Report:

- Selected port.
- Whether app server was started.
- Whether Inngest was required for the manual validation flow and whether it was started.
- Whether authentication bootstrap via `/demo-login` succeeded.
- Credential source used for login (`process env` or `.env` preload) and whether whitespace normalization was applied.
- Verification evidence (`curl` status code and whether readiness passed).
- Manual validation results (routes visited, key observed outcomes, and pass/fail per check).
