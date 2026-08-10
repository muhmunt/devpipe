# Phase R1 — Rust Backend Foundation

Goal: stand up the real axum app on the R0 schema, on top of the bare
scaffolding left by `phase-r-delete-everything.md` (empty axum server, no
routes, no `db.rs`/`handlers.rs`). No Go backend exists anymore — nothing to
run alongside, nothing to keep operationally compatible with.

## Tasks

### 1.1 — Crate layout
Restructure `be-rust/` into a workspace matching spec §68's crate separation
(scaled down — one crate per real concern, not 31 crates like the reference
native app):
```
be-rust/
├── Cargo.toml           # workspace root
├── api/                 # axum HTTP layer (was src/main.rs)
├── domain/               # entity structs, WorktreeManager/AgentAdapter traits (from R0)
├── db/                   # sqlx queries, migrations
├── git/                   # phase-r2
├── agents/                # phase-r3
└── events/                 # phase-r4
```
If workspace-splitting adds friction early, a single `be-rust/src/{api,domain,db}.rs`
module layout is acceptable for R1 — only split into real crates when git/agents/events
modules (R2-R4) grow large enough to warrant it. Don't over-engineer the crate
graph before there's code to justify it.

### 1.2 — Migrations
- Add `sqlx-cli` migrations dir (`be-rust/migrations/`), one file per R0 table
  (`0001_workspaces.sql`, `0002_repositories.sql`, ... `0006_commands.sql`).
- `db::connect` runs migrations on startup (`sqlx::migrate!()`) against a
  fresh database — no prior schema to reconcile with, since D.1 already
  backed up and retired the old Postgres data.

### 1.3 — CRUD handlers (workspace/repository/worktree only — sessions come in R3-R4)
```
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:id
GET    /api/workspaces/:id/repositories
POST   /api/repositories
GET    /api/repositories/:id
POST   /api/repositories/:id/worktrees        (calls WorktreeManager, stub until R2)
GET    /api/worktrees/:id
DELETE /api/worktrees/:id
```
- Use `axum::extract::State` for the `PgPool` + `Arc<dyn WorktreeManager>` (R2
  stub returns `not_implemented` until R2 lands — return HTTP 501, not a fake
  success, so R1 can ship and be tested independently).
- Response DTOs are hand-written structs deriving `Serialize`, field names
  matching R0 schema exactly (snake_case DB → camelCase JSON via `#[serde(rename_all = "camelCase")]`)
  so `phase-r5` frontend types map 1:1.

### 1.4 — Error handling
- Central `AppError` enum → `IntoResponse` impl (404/409/422/500 mapped
  consistently) — this is the one place error shape is decided; every handler
  returns `Result<T, AppError>`.

### 1.5 — Config/env
- `be-rust` becomes the one and only backend, bound to whatever port the
  frontend expects (`8081`, matching where `be` used to run — no reason to
  keep `8082` once there's nothing else to avoid colliding with).

## Acceptance criteria
- `cargo test` covers: migration runs clean on empty DB, workspace/repository/worktree
  CRUD round-trips, 404s on missing IDs, worktree-create returns 501 (R2 not landed yet).
- `be-rust` is the sole backend process; single `devpipe` database, no
  parallel/legacy DB to keep in sync.

## Manual test checklist
- [ ] `cargo run` in `be-rust`, hit each route with `curl`, verify JSON shape matches R0 DTOs.
- [ ] Kill DB mid-request, confirm 500 with a clean error body, not a panic.
- [ ] Confirm no other backend process is running/expected — `be-rust` alone serves the app from this phase forward.
