# devpipe Full Rewrite — delete everything, rebuild from zero on the reference .md

**Supersedes** `docs/redesign/phase-0..7` entirely, including their
design-system decisions — **no reuse**. New instruction (confirmed): delete
`fe/` and `be/` (Go) completely and rebuild both from `super_engineering_reference_spec.md`
directly, adapted to a **website** (Vite frontend, not a native macOS app).

## What "rebuild from zero" means here, concretely

| Layer | Before | After |
|---|---|---|
| Backend language | Go (`be/`, chi router) — **deleted** | Rust (`be-rust/`, axum) — the only backend, built fresh |
| Backend entity model | Single `Card` table (task+repo conflated) — **deleted** | `workspaces`, `repositories`, `worktrees`, `agent_definitions`, `agent_sessions`, `session_events`, `commands` — spec §33 schema, Postgres-adapted, designed fresh in R0 |
| Agent integration | `be/internal/agent/adapter.go` — **deleted** | Rust `AgentAdapter` trait (§9), designed fresh against real Claude/Cursor CLI docs, not ported behavior |
| Process execution | Go `runs`/`artifacts` tables — **deleted** | Rust `ProcessManager` (§37) + normalized `AgentEvent` protocol (§42), fresh design |
| Event delivery | `stream.Hub` SSE (Go) — **deleted** | Rust SSE event bus (§13), fresh implementation |
| Frontend source | `fe/src/{components,pages,lib}` — **deleted entirely** | Rebuilt fresh: types/API client against new Rust contract, screens/design system derived directly from spec §18-31, §86-88 |
| Old data (Postgres) | Live `cards`/`prds`/`plans`/`runs`/`chat` rows | Backed up (`phase-r-delete-everything.md` D.1), then **not migrated forward** — new schema starts empty |

## What's reused vs. rebuilt

- **Reused**: nothing from the old codebase or from the earlier
  `docs/redesign/phase-0..7` design-system plan. Those docs are retired.
- **Kept as scaffolding only**: `be-rust/`'s `Cargo.toml` dependency choices
  (axum/sqlx/tokio) and `fe/`'s Vite/Tailwind/TypeScript project config —
  build tooling, not application code.
- **Everything else is designed fresh** directly from
  `super_engineering_reference_spec.md`: entity model (§6), agent adapter
  architecture (§9), event protocol (§42), design tokens (§30), screens
  (§86), flows (§58-65).

## Starting point (audited 2026-08-10, before deletion)

- `be/` — Go, chi router, handlers for cards/agents/prds/plans/build/stream/chat/runs/paths.
- `be-rust/` — 204-line axum+sqlx skeleton (`cards` table only, no git/process/event/agent code).
- `fe/src` — React/Vite app, `Card`/`Stage`-based kanban UI (Board/CardDetail/ChatStep/PlanStep/BuildStep/AcceptStep).

All three are addressed by `phase-r-delete-everything.md`, which runs first.

## Build ladder

`BUILD-LADDER.md` is the real execution order — merges `phase-r9`'s 6
gap-closing tasks into the rung where their dependencies actually land
(e.g. session-restart reconciliation can't be built before sessions +
process manager exist), instead of running them all at the end. Start there
when you're ready to build; use the phase files below for task-level detail.

## Phase index

| Phase | File | Focus |
|---|---|---|
| R(-1) | `phase-r-delete-everything.md` | **Runs first.** Backup DB, delete `be/`, delete `fe/src`, reset `be-rust/` to bare scaffolding — destructive, needs explicit go-ahead before executing |
| R0 | `phase-r0-architecture-entity-model.md` | Full entity model + schema design, deviations from spec documented |
| R1 | `phase-r1-rust-backend-foundation.md` | axum app skeleton, migrations, CRUD for workspace/repo/worktree |
| R2 | `phase-r2-worktree-git-manager.md` | Git worktree isolation (§7), git2/shell decision |
| R3 | `phase-r3-agent-adapter-process-manager.md` | `AgentAdapter` trait, process spawn/kill, per-provider adapters (designed fresh against real CLI docs) |
| R4 | `phase-r4-event-bus-sessions.md` | Normalized `AgentEvent` protocol, session/chat/terminal persistence |
| R5 | `phase-r5-frontend-rewrite.md` | Full frontend rebuild from zero: design system, primitives, types/API, all screens, all flows — directly off the spec |
| R6 | `phase-r6-local-api-cli.md` | Optional: local API + `dp` CLI (§40-41), scoped for a hosted web app |
| R7 | `phase-r7-cutover-migration.md` | Launch readiness check (no data migration — old data was backed up and retired up front in R(-1)) |
| R8 | `phase-r8-observability-security.md` | Observability dashboard, security hardening |
| R9 | `phase-r9-resilience-extensibility.md` | Terminal-decision fix, editor detection, custom CLI agents, session-restart reconciliation, event-bus backpressure, conflict-resolution UX (found on 4th audit pass) |

Each phase file: goals, concrete tasks with target files/crates, explicit
decisions (with reasoning) where the spec's native-macOS assumptions don't
apply to a web product, acceptance criteria, manual test checklist.

## Non-negotiable constraints carried from earlier conversation
- Frontend stays a **website** built with **Vite** (not a native app) — spec's
  Rust+Metal native-GUI sections (§2.1, §10, §34) do NOT apply; only its
  *backend/domain* and *screen/flow* architecture (§6-9, §18-31, §33, §36-48,
  §58-65, §86-88) is adopted.
- No multi-agent orchestration tooling (Workflow/subagents) used to execute
  this plan — sequential manual phases per your standing instruction.
- The repo will be **non-functional between R(-1) and the end of R1+R5** —
  expected for a from-zero rewrite. Do this on a dedicated branch until R5
  restores a working app, not on `main`, unless you explicitly say otherwise.

## Before executing anything
`phase-r-delete-everything.md` requires explicit confirmation on: deleting
`be/` now, deleting `fe/src` now, resetting `be-rust/` now, and what happens
to the existing Postgres data (backup + drop, vs. backup + leave in place
untouched). Say which of those you want done now vs. left as documented plan.
