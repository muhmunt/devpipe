# Rust backend migration — Phase 0 (prove the pattern)

Status: approved (design), pending plan
Date: 2026-08-10

## Origin

User asked to rewrite devpipe's backend from Go to Rust, keeping the
Vite/React/TS frontend as-is (not a platform change — still a web app, not
desktop). This followed from a reference doc
(`super_engineering_reference_spec.md`, a reverse-engineered product/
architecture analysis of the Superconductor/super.engineering app) that
was dropped mid-way through an unrelated, already-in-flight SDD plan (the
app-shell "Active Cards" rail — Tasks 1-4 done and committed, Tasks 5-6
paused, not abandoned).

A full "rewrite everything based on this doc" is not one project — it
bundles a language migration (Go→Rust), an entity-model redesign
(Workspace/Repository/Worktree/Session vs. devpipe's current Card-centric
model), and a long list of feature gaps (PTY terminal, multi-agent
orchestration, custom commands, notifications, command palette, etc.) into
a single undertaking that would leave devpipe non-functional for the
duration and unverifiable until the end. Decomposed into phases instead:

- **Phase 0 (this spec):** prove the Rust backend pattern works against
  devpipe's real schema — no cutover, no entity-model change.
- Phase 1: mechanical port of the rest of the CRUD domains, same entity
  model, same API contract.
- Phase 2: the hard subsystems (worktree/git, agent-adapter process
  invocation, the SSE event hub, a real PTY).
- Phase 3: the actual entity-model redesign toward the doc's concepts,
  once the backend port is stable.
- Phase 4+: feature gaps, one at a time.

This spec covers Phase 0 only. Later phases get their own brainstorm/spec/
plan cycle once Phase 0 proves the approach out.

## What's already true (context, not decisions)

- Go backend (`be/`) is untouched by this phase — stays the app's real,
  running backend. Nothing points at the new Rust service yet.
- Same Postgres instance, same schema, zero migrations added or changed in
  this phase.
- `cards` table (from `be/migrations/0001_init.up.sql` +
  `0005_multi_draft.up.sql`):
  ```sql
  id            TEXT PRIMARY KEY
  title         TEXT NOT NULL
  repo_path     TEXT NOT NULL
  branch        TEXT NOT NULL
  worktree_path TEXT
  stage         stage NOT NULL DEFAULT 'prd'          -- enum
  agent         agent_type NOT NULL DEFAULT 'claude'  -- enum
  status        run_status NOT NULL DEFAULT 'idle'    -- enum
  active_prd_id  TEXT NOT NULL REFERENCES prds(id)
  active_plan_id TEXT REFERENCES plans(id)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  ```
- `prds` table has `id`, `card_id`, `title`, `content`, `version`,
  `status`, plus provenance columns not needed for this phase.
- Go's `CardStore.Create` (`be/internal/db/cards.go:40-69`) is a single
  transaction: insert the card row, insert a first PRD draft row
  (`title = 'Draft 1'`, `content = ''`), then `UPDATE cards SET
  active_prd_id = <new prd id>`, all committed atomically. A card is never
  observable without an active PRD — Phase 0 must replicate this exactly,
  not just insert a bare card row (which would violate the `active_prd_id
  NOT NULL` constraint anyway).
- Go's JSON shape (`be/internal/db/cards.go:13-26`, mirrored in
  `fe/src/lib/types.ts`'s `Card` type) uses camelCase keys: `id`, `title`,
  `repoPath`, `branch`, `worktreePath`, `stage`, `agent`, `status`,
  `activePrdId`, `activePlanId`, `createdAt`, `updatedAt`.

## Goal

Stand up a minimal, working Rust service that reads and writes the real
`cards`/`prds` tables correctly, with a JSON API shape identical to Go's,
proving the Rust+Postgres pattern before committing to a full port. Not a
cutover — nothing in the running app points at this service yet.

## Non-goals (explicitly out of scope for Phase 0)

- No frontend changes. No FE code touches the new service.
- No changes to the Go backend, `be/`, or its route table.
- No new migrations, no schema changes.
- No PRD/Plan/Task/Run/Chat/Agent/Stream endpoints — only the 3 card
  endpoints below, plus the minimum PRD-table write `Create`'s transaction
  requires.
- No auth, no CORS config (nothing external calls this yet), no
  containerization/deployment concerns.

## Design

### Directory & stack

New Cargo workspace at `be-rust/`, sibling to `be/`. Axum (web framework) +
sqlx (Postgres driver, async, raw SQL — no ORM, matching pgx's style in the
Go backend) + Tokio (async runtime). Listens on port `8082` (Go keeps
`8081`, FE dev server keeps `5173`/`5174` — no port conflicts, nothing
wired together).

```
be-rust/
├── Cargo.toml
└── src/
    ├── main.rs       — Tokio runtime bootstrap, axum router, DB pool
    ├── db.rs          — sqlx Pool setup, Card struct + queries
    └── handlers.rs    — the 3 route handlers
```

### Data model

```rust
#[derive(sqlx::FromRow, serde::Serialize)]
struct Card {
    id: String,
    title: String,
    #[sqlx(rename = "repo_path")]
    #[serde(rename = "repoPath")]
    repo_path: String,
    branch: String,
    #[sqlx(rename = "worktree_path")]
    #[serde(rename = "worktreePath")]
    worktree_path: Option<String>,
    stage: String,
    agent: String,
    status: String,
    #[sqlx(rename = "active_prd_id")]
    #[serde(rename = "activePrdId")]
    active_prd_id: String,
    #[sqlx(rename = "active_plan_id")]
    #[serde(rename = "activePlanId")]
    active_plan_id: Option<String>,
    #[sqlx(rename = "created_at")]
    #[serde(rename = "createdAt")]
    created_at: chrono::DateTime<chrono::Utc>,
    #[sqlx(rename = "updated_at")]
    #[serde(rename = "updatedAt")]
    updated_at: chrono::DateTime<chrono::Utc>,
}
```

`stage`/`agent`/`status` map to Postgres enums — read/written as plain
`TEXT` via sqlx's default string mapping (no custom enum type needed for
this phase; matches how Go's pgx driver also just treats them as strings
at the struct level).

### Endpoints

- `GET /cards` — `SELECT ... FROM cards ORDER BY updated_at DESC`, same
  column list and order as Go's `CardStore.List`.
- `POST /cards` — body `{ title, repoPath, agent }` (agent defaults to
  `"claude"` if omitted, matching Go). Single sqlx transaction: generate a
  UUID for the card id and a UUID for the PRD id (via the `uuid` crate),
  insert the card row, insert the PRD row (`title = 'Draft 1'`, `content =
  ''`), `UPDATE cards SET active_prd_id = $2 WHERE id = $1`, commit, then
  re-`SELECT` and return the full card row (mirrors Go returning the
  `RETURNING`-clause row from the final `UPDATE`).
- `GET /cards/:id` — `SELECT ... FROM cards WHERE id = $1`, 404 if not
  found (matches Go's `http.StatusNotFound` on `pgx.ErrNoRows`).

### Error handling

- DB connection failure at startup: panic with a clear message (matches
  Go's `log.Fatalf` pattern — this is a dev-only proof service, not
  expected to run unattended).
- Query errors: return `500` with the error's `Display` string in the
  body — matches Go's `http.Error(w, err.Error(), ...)` pattern exactly,
  no need to invent a different error contract for this phase.
- `GET /cards/:id` on a missing id: `404`.

### Testing

No mocking, no fake database — matches how the Go backend has been
verified all session. Verification is real, against the same local
Postgres devpipe already uses:

1. `cd be-rust && cargo build` — clean compile.
2. Start the service (`cargo run`), confirm it binds `:8082` without
   error (same Postgres connection string devpipe already uses,
   `DATABASE_URL` env var or the same default Go falls back to).
3. `curl -X POST localhost:8082/cards -d '{"title":"rust-phase0-test","repoPath":"/tmp/whatever","agent":"claude"}'` —
   confirm the response has `activePrdId` set (non-null, non-empty) in the
   same request/response round-trip — this is the one behavior most likely
   to be wrong if the transaction isn't implemented correctly.
4. `curl localhost:8082/cards` — confirm the test card appears, in
   `updated_at DESC` order.
5. `curl localhost:8082/cards/<id-from-step-3>` — confirm the single-card
   fetch matches.
6. Confirm the Go backend (`cd be && go run ./cmd/api`) still lists this
   same test card via `curl localhost:8081/api/cards` — proves both
   services are reading/writing the identical schema correctly, not two
   diverging views of the data.
7. Clean up the test card afterward (`DELETE FROM cards WHERE id = '<id>'`
   directly against Postgres — no `DELETE` endpoint exists in either
   backend yet).

## Open questions (none blocking)

None — schema, Go's exact transactional behavior, and JSON shape are all
confirmed from the current codebase, not guessed at.
