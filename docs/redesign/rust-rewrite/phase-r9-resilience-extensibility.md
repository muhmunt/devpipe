# Phase R9 — Resilience, Custom Agents, Editor Detection (found on 4th audit pass)

Goal: close gaps found re-auditing R0-R8 against `super_engineering_reference_spec.md`
directly (not against the old Go-plan). Depends on R1-R5.

## 9.1 — Terminal-surface decision (fixes dangling reference)
`phase-r5-frontend-rewrite.md`'s screen table pointed at a "phase-r4.4/6.1
decision" for the terminal/log view — that cross-reference was stale (old
Go-plan's `phase-6.1`, deleted along with that plan). Decision, made fresh
here (spec §10-12):
- **(b) Log/scrollback viewer**, sourced from `session_events` `ToolOutput`
  events (R4.1) — same reasoning as before: matches what the backend already
  captures via the normalized event log, no new dependency (no `xterm.js`,
  no live PTY streaming).
- **(a) Live PTY streaming** stays a documented future upgrade, not built now
  — only revisit if users need to watch truly live raw agent output beyond
  what structured `AgentEvent`s already provide.
- Task: `LogsPage.tsx` (R5.4) renders `ToolOutput`/`MessageDelta` events in a
  mono-font scrollback panel, reusing R4.3's SSE stream — no separate terminal
  transport.

## 9.2 — Editor detection (spec §25, §38, §58)
Spec's onboarding flow explicitly lists "Detect editors ✓" alongside git/agent
detection, and §25's "Open in Editor" feature needs to know which editors are
actually installed before showing options.
- Backend: extend R3.2's detection module — `detect_editor(name: &str) -> bool`
  using `which::which("code")` / `which::which("cursor")` / `which::which("zed")`.
- New endpoint: `GET /api/editors/detect` → `{"vscode": bool, "cursor": bool, "zed": bool}`.
- Frontend: `Onboarding.tsx` (R5.4) shows detected editors; `WorktreePage.tsx`'s
  "Open in Editor" action (R5.6) only offers buttons for editors actually
  detected as present — no dead buttons for uninstalled editors.

## 9.3 — Custom CLI agent support (spec §39)
Spec treats this as first-class, not advanced-tier. R0's `agent_definitions`
table already has generic `executable`/`default_args` columns — the schema
supports it, but no adapter/UI lets a user actually define one.
- Backend: generic `CustomCliAdapter` implementing R0's `AgentAdapter` trait —
  reads `executable`/`default_args`/env policy from the `agent_definitions`
  row instead of being hardcoded like `ClaudeAdapter`/`CursorAdapter` (R3.3-3.4).
  Template variables (`{workspace}`, `{repository}`, `{worktree}`, `{branch}`,
  `{target_branch}`) substituted into `default_args`/`env` before spawn, per
  spec §39's example config shape.
- `POST /api/agent-definitions` — create a custom agent definition
  (name, executable, args, env policy). No auth beyond whatever R6.2 adds
  (if R6 ships); if R6 is skipped, this endpoint is unauthenticated same as
  everything else in this build (matches R0's "no auth system" baseline).
- Frontend: Settings → Agents (R5.4's Global Settings screen) gets an
  "Add custom agent" form, matching spec §39's config example.

## 9.4 — Session reconciliation after backend restart (spec §45-46)
Spec: "If a process cannot be restored: Session interrupted [Restart Agent]
[Open Terminal] [Dismiss]". R1-R4 never addressed what happens to sessions
marked `running`/`starting` in the DB when `be-rust` itself restarts (their
tracked child PIDs from R3.1's `ProcessManager` are gone — the in-memory
process table doesn't survive a process restart).
- On `be-rust` startup (after migrations, before serving traffic): query
  `agent_sessions` where `status IN ('running','starting','needs_input','waiting')`,
  transition each to `failed` with a distinguishing marker (e.g. a
  `SessionError` event with `message: "interrupted by server restart"|
  reused as the exit reason) — do NOT silently leave them in a `running`
  state that no live process backs.
- Frontend: sessions in this reconciled-failed state get the same
  Restart/Logs/Delete action row as any other failed session (R5.5) — no new
  UI needed, just correct backend state on boot so the existing failed-session
  UX naturally covers it.

## 9.5 — Event bus backpressure (spec §44)
R4.2's `tokio::sync::broadcast` channel has a bounded buffer — under
`MessageDelta` chunk floods (a verbose agent streaming many small deltas),
slow SSE consumers can lag/drop. Address:
- Batch `MessageDelta` events server-side: coalesce deltas arriving within a
  short window (e.g. 50-100ms) into one SSE frame before sending, rather than
  one SSE event per token/chunk — reduces both bus pressure and frontend
  render churn (this was previously a frontend-only concern in the retired
  phase-4.3; moving the batching server-side is more effective since it cuts
  network frames too, not just render calls).
- Broadcast channel capacity sized generously (e.g. 1024) with an explicit
  `RecvError::Lagged` handler that logs a warning and continues from the next
  available event, rather than silently dropping the connection.

## 9.6 — Conflict-resolution UX step (spec §24, closes note from R2.3/R5.5)
R2.3 detects `conflicted` worktree status; R5.5's merge flow didn't explicitly
route through it.
- Git action bar (R5.5): when `worktree.status == 'conflicted'`, primary
  action becomes "Resolve conflicts" instead of the normal
  commit/push/PR/merge progression — clicking it surfaces the conflicted
  file list (reuse R2's diff endpoint, filtered to conflict markers) and
  explicitly does NOT attempt automatic resolution (matches spec's "should
  NOT pretend conflicts do not exist"). Once the user resolves conflicts
  externally (editor handoff, 9.2) and commits, `status()` naturally reports
  `clean`/`modified` again and the normal action sequence resumes.

## Acceptance criteria
- No dangling cross-references to deleted files remain anywhere in `docs/redesign/rust-rewrite/` (`grep -rn "phase-6\." docs/redesign/rust-rewrite/` returns nothing).
- A custom agent definition can be created and actually launched end-to-end.
- Killing `be-rust` mid-session and restarting it leaves that session in a clean `failed` state, not a permanently-stuck `running` state.
- Editor handoff buttons never appear for an editor that isn't installed.

## Manual test checklist
- [ ] Start a session, kill `be-rust` process, restart it, confirm the session shows as failed with a restart option, not stuck "running" forever.
- [ ] Define a custom agent (e.g. wrapping a simple shell script), launch a session with it, confirm it runs in the correct worktree.
- [ ] Trigger a merge conflict, confirm git action bar shows "Resolve conflicts" instead of the normal action, and no auto-resolution happens.
- [ ] On a machine with only VS Code installed (no Cursor/Zed), confirm only the VS Code editor-handoff button appears.
- [ ] Stream a verbose agent response, confirm SSE frames are batched (inspect network tab — not one frame per character).
