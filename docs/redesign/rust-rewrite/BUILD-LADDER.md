# Build Ladder — execution order across all phases (R-1 → R8, R9 folded in)

`phase-r9` was written as a standalone gap-closing phase, but its 6 tasks each
belong inside an earlier phase's actual build sequence (e.g. you can't
reconcile orphaned agent sessions before the `agent_sessions` table and
process spawning exist). This ladder is the real execution order — merges R9
into the rungs where its tasks structurally belong. Each rung lists its exit
gate: what must be true before starting the next rung.

```
Rung 0 ── R(-1) Delete everything
   │        Backup Postgres data, delete be/, delete fe/src,
   │        reset be-rust/ to bare axum skeleton.
   │        EXIT GATE: repo is git-clean, be-rust `cargo check` passes empty,
   │                   fe `npm run dev` boots a blank page, DB backup confirmed stored.
   ▼
Rung 1 ── R0 Architecture & entity model (design-only, no app code)
   │        Schema DDL + trait signatures finalized and reviewed.
   │        EXIT GATE: schema approved, trait stubs compile as an
   │                   empty-impl crate (`cargo check`).
   ▼
Rung 2 ── R1 Backend foundation
   │        Crate layout, migrations (R0 schema), CRUD for
   │        workspace/repository/worktree (worktree-create stubbed 501).
   │        EXIT GATE: R1's manual test checklist passes; `be-rust` is the
   │                   only backend process, single fresh `devpipe` DB.
   ▼
Rung 3 ── R2 Worktree & git manager
   │        git worktree add/remove/status/diff; conflict detection.
   │        Unblocks R1's stubbed worktree-create endpoint (real impl now).
   │        EXIT GATE: R2's manual test checklist passes, including the
   │                   conflicted-status fixture test.
   ▼
Rung 4 ── R3 Agent adapters + process manager  (+ R9.2, R9.3 folded in)
   │        3.1 ProcessManager (spawn/kill/status)
   │        3.2 Agent detection (claude/cursor)
   │      + R9.2 Editor detection (vscode/cursor/zed) — same detection
   │        module, built alongside agent detection since it's the same
   │        `which`-based pattern.
   │        3.3-3.4 Claude/Cursor adapters (verified against real CLI docs)
   │      + R9.3 Generic CustomCliAdapter, reading agent_definitions rows,
   │        `POST /api/agent-definitions` — built right after the two
   │        concrete adapters exist, so the generic path can be tested
   │        against the same AgentAdapter trait they already validated.
   │        EXIT GATE: R3's checklist passes + a custom agent definition
   │                   can be created and launched end-to-end (R9's checklist item).
   ▼
Rung 5 ── R4 Event bus + sessions  (+ R9.4, R9.5 folded in)
   │        4.1 AgentEvent enum, 4.2 event bus, 4.3 SSE endpoint,
   │        4.4 timeline read model, 4.5 needs-input reply
   │      + R9.5 Backpressure: batch MessageDelta server-side, size the
   │        broadcast channel, handle Lagged — built as part of 4.2's
   │        initial implementation, not bolted on after.
   │      + R9.4 Session reconciliation on startup — this is the first
   │        point `agent_sessions` rows can actually go stale across a
   │        restart (sessions + process manager both exist now), so the
   │        boot-time reconciliation query belongs here, run once right
   │        after 4.2's bus and before the server starts accepting traffic.
   │        EXIT GATE: R4's checklist passes + killing/restarting `be-rust`
   │                   mid-session correctly reconciles to `failed` (R9.4 test)
   │                   + verbose streaming session shows batched SSE frames (R9.5 test).
   ▼
Rung 6 ── R6 Local API / CLI  (optional, can run parallel to Rung 7)
   │        Scoping decision first (self-hosted vs hosted-service transport),
   │        then thin `dp` CLI + token auth if justified.
   │        Independent of the frontend — safe to build in parallel with
   │        Rung 7, or skip if the scoping call is "not needed."
   │        EXIT GATE: either shipped + checklist passes, or explicitly
   │                   skipped with reasoning recorded.
   ▼
Rung 7 ── R5 Frontend rebuild  (+ R9.1, R9.6-frontend folded in)
   │        5.1 Design tokens, 5.2 primitives (StatusDot/AppShell/palette),
   │        5.3 types+API client (against R1-R4's real endpoints, so this
   │        rung cannot start meaningfully before Rung 5 exits),
   │        5.4 all screens
   │      + R9.1 LogsPage.tsx built as the terminal-surface answer (log
   │        viewer off session_events, not live PTY) — this is literally
   │        one of 5.4's table rows, no separate step.
   │        5.5 flows (launch/needs-input/failed/merge/archive)
   │      + R9.6 conflict-resolution step wired into 5.5's git action bar
   │        (worktree.status == 'conflicted' → "Resolve conflicts" action,
   │        using R2's diff endpoint from Rung 3).
   │        5.6 editor handoff (now has real detected-editor data from
   │        Rung 4's R9.2), workspace scripts, custom commands.
   │        EXIT GATE: R5's full manual test checklist passes end-to-end
   │                   (onboarding → workspace → session → diff → merge →
   │                   archive), plus R9's editor-detection and
   │                   conflict-resolution checklist items.
   ▼
Rung 8 ── R7 Launch readiness
   │        CI/deploy config audit, port/env finalize, optional rename.
   │        EXIT GATE: full smoke test against a real deployed be-rust
   │                   instance; zero references to deleted Go backend anywhere.
   ▼
Rung 9 ── R8 Observability + security hardening
            Aggregate dashboard (§43), full endpoint security audit (§47)
            run against the now-complete route list (every route added
            Rungs 2-8, enumerated fresh, not from memory).
            EXIT GATE: R8's checklist passes — this is the last rung;
                       app is considered rewrite-complete after this.
```

## Why this order (not just R-1→R9 file order)
- **Backend before frontend, always.** Rung 7 (frontend) can't be built
  against real endpoints until Rungs 2-6 exist — R5.3's types/API client are
  written against *actual* Rust DTOs, not guessed ones.
- **Detection before dependent features.** Editor detection (Rung 4) has to
  exist before editor-handoff buttons (Rung 7) can be gated correctly;
  agent adapters (Rung 4) before custom-agent config UI (Rung 7's Settings screen).
- **Resilience tasks land where their dependencies first exist**, not at the
  end as an afterthought — R9.4 needs sessions+process-manager (Rung 5), R9.5
  needs the event bus (Rung 5), R9.1/R9.6 need frontend screens (Rung 7) to
  attach to. Keeping them as a trailing "phase 9" would mean shipping known-
  broken behavior (stuck sessions, unbatched floods, dead terminal tab, no
  conflict path) through 7 rungs before fixing it — this ladder avoids that.
- **R6 (local API/CLI) is a side-branch**, not a dependency of anything else —
  parallelizable with Rung 7 if you have the bandwidth, or safely deferred
  past Rung 9 without blocking the rest of the rewrite.

## Using this ladder
Work one rung at a time. Each rung's exit gate must be true (its checklist
items pass) before starting the next rung — this is the sequencing contract;
the individual `phase-r*.md` files still hold the full task detail for each
rung's content. `phase-r9.md` itself is now superseded as a "phase to run
last" — its content is correct, just relocated into the rungs above; keep the
file as the detailed task reference for those folded-in items, don't re-derive.
