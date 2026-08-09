# Rust Backend Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a minimal, standalone Rust service (`be-rust/`) that reads and writes devpipe's real `cards`/`prds` Postgres tables correctly — proving the Rust+Postgres pattern before committing to a full backend port. Not a cutover: nothing in the running app points at this service yet.

**Architecture:** Axum (web framework) + sqlx (raw-SQL async Postgres driver, no ORM — matches the Go backend's pgx style) + Tokio (async runtime), in a new Cargo workspace sibling to `be/`. Two tasks: first prove DB connectivity/queries work standalone (no HTTP yet), then add the axum HTTP layer on top.

**Tech Stack:** Rust (stable toolchain, already installed — confirmed `cargo 1.94.1`), axum ~0.7, sqlx ~0.8, tokio 1, serde 1, chrono 0.4, uuid 1.

## Global Constraints

- Go backend (`be/`) is not modified anywhere in this plan.
- No new/changed Postgres migrations. Same schema Go already uses.
- No frontend changes. Nothing in `fe/` is touched.
- New service listens on port `8082` — Go keeps `8081`, FE dev server keeps `5173`/`5174`.
- JSON field names must be camelCase and match Go's exactly: `id`, `title`, `repoPath`, `branch`, `worktreePath`, `stage`, `agent`, `status`, `activePrdId`, `activePlanId`, `createdAt`, `updatedAt`.
- `POST /cards` must replicate Go's exact transaction: insert card row, insert a PRD row (`title = 'Draft 1'`, `content = ''`), `UPDATE cards SET active_prd_id = <new prd id>`, all atomic — a card must never be observable without `active_prd_id` set.
- Crate versions in this plan (axum ~0.7, sqlx ~0.8) are a floor, not an exact pin — if `cargo build` resolves newer compatible majors by the time this runs, that's fine; note it in the task report rather than fighting the resolver.
- No automated tests in this plan (matches the Go backend's own convention — mostly no tests). Verification is real `curl` against the real local Postgres, per the spec.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `be-rust/Cargo.toml` | **new** | Workspace manifest, dependencies. |
| `be-rust/src/db.rs` | **new** | `Card` struct (sqlx + serde mapping), pool setup, the 3 query functions (`list_cards`, `get_card`, `create_card`). |
| `be-rust/src/handlers.rs` | **new** | The 3 axum route handlers, request body type for `POST /cards`. |
| `be-rust/src/main.rs` | **new** | Task 1: DB-only proof (connects, lists cards, prints). Task 2: rewritten to serve axum HTTP instead. |

---

### Task 1: Cargo scaffold + `db.rs` — prove DB connectivity and queries, no HTTP yet

**Files:**
- Create: `be-rust/Cargo.toml`
- Create: `be-rust/src/db.rs`
- Create: `be-rust/src/main.rs`

**Interfaces:**
- Produces: `db::Card` struct (all fields per Global Constraints' field list, `pub`, deriving `sqlx::FromRow` + `serde::Serialize`); `db::connect(database_url: &str) -> PgPool`; `db::list_cards(pool: &PgPool) -> Result<Vec<Card>, sqlx::Error>`; `db::get_card(pool: &PgPool, id: &str) -> Result<Option<Card>, sqlx::Error>`; `db::create_card(pool: &PgPool, title: &str, repo_path: &str, agent: &str) -> Result<Card, sqlx::Error>`. Task 2 imports all of these by these exact names/signatures.

- [ ] **Step 1: Create `be-rust/Cargo.toml`**

```toml
[package]
name = "devpipe-rust"
version = "0.0.1"
edition = "2021"

[[bin]]
name = "devpipe-rust"
path = "src/main.rs"

[dependencies]
tokio = { version = "1", features = ["full"] }
axum = "0.7"
sqlx = { version = "0.8", features = ["runtime-tokio", "postgres", "chrono", "uuid"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
```

(`axum` is listed here even though Task 1 doesn't use it yet — Task 2 needs it and there's no value in a second `cargo add` round-trip. Do not write any axum code in this task.)

- [ ] **Step 2: Create `be-rust/src/db.rs`**

```rust
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

#[derive(sqlx::FromRow, serde::Serialize)]
pub struct Card {
    pub id: String,
    pub title: String,
    #[sqlx(rename = "repo_path")]
    #[serde(rename = "repoPath")]
    pub repo_path: String,
    pub branch: String,
    #[sqlx(rename = "worktree_path")]
    #[serde(rename = "worktreePath")]
    pub worktree_path: Option<String>,
    pub stage: String,
    pub agent: String,
    pub status: String,
    #[sqlx(rename = "active_prd_id")]
    #[serde(rename = "activePrdId")]
    pub active_prd_id: String,
    #[sqlx(rename = "active_plan_id")]
    #[serde(rename = "activePlanId")]
    pub active_plan_id: Option<String>,
    #[sqlx(rename = "created_at")]
    #[serde(rename = "createdAt")]
    pub created_at: chrono::DateTime<chrono::Utc>,
    #[sqlx(rename = "updated_at")]
    #[serde(rename = "updatedAt")]
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

const CARD_COLUMNS: &str =
    "id, title, repo_path, branch, worktree_path, stage, agent, status, active_prd_id, active_plan_id, created_at, updated_at";

pub async fn connect(database_url: &str) -> PgPool {
    PgPoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await
        .expect("failed to connect to Postgres")
}

pub async fn list_cards(pool: &PgPool) -> Result<Vec<Card>, sqlx::Error> {
    let query = format!("SELECT {CARD_COLUMNS} FROM cards ORDER BY updated_at DESC");
    sqlx::query_as::<_, Card>(&query).fetch_all(pool).await
}

pub async fn get_card(pool: &PgPool, id: &str) -> Result<Option<Card>, sqlx::Error> {
    let query = format!("SELECT {CARD_COLUMNS} FROM cards WHERE id = $1");
    sqlx::query_as::<_, Card>(&query)
        .bind(id)
        .fetch_optional(pool)
        .await
}

// Mirrors Go's CardStore.Create (be/internal/db/cards.go:40-69) exactly:
// insert card, insert a first PRD draft, activate it, all in one
// transaction — a card is never observable without active_prd_id set.
pub async fn create_card(
    pool: &PgPool,
    title: &str,
    repo_path: &str,
    agent: &str,
) -> Result<Card, sqlx::Error> {
    let card_id = uuid::Uuid::new_v4().to_string();
    let prd_id = uuid::Uuid::new_v4().to_string();
    // Simplified vs. Go's tempBranch (which slugifies the title) — Phase 0
    // is proving the transaction/query pattern, not porting slug
    // generation, which belongs to the later mechanical-port phase.
    let branch = format!("devpipe/{}", &card_id[..8]);

    let mut tx = pool.begin().await?;

    sqlx::query("INSERT INTO cards (id, title, repo_path, branch, agent) VALUES ($1, $2, $3, $4, $5)")
        .bind(&card_id)
        .bind(title)
        .bind(repo_path)
        .bind(&branch)
        .bind(agent)
        .execute(&mut *tx)
        .await?;

    sqlx::query("INSERT INTO prds (id, card_id, title, content) VALUES ($1, $2, 'Draft 1', '')")
        .bind(&prd_id)
        .bind(&card_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("UPDATE cards SET active_prd_id = $2, updated_at = now() WHERE id = $1")
        .bind(&card_id)
        .bind(&prd_id)
        .execute(&mut *tx)
        .await?;

    let query = format!("SELECT {CARD_COLUMNS} FROM cards WHERE id = $1");
    let card = sqlx::query_as::<_, Card>(&query)
        .bind(&card_id)
        .fetch_one(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(card)
}
```

- [ ] **Step 3: Create `be-rust/src/main.rs` (DB-only proof, no HTTP)**

```rust
mod db;

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://devpipe:devpipe@localhost:5432/devpipe?sslmode=disable".to_string());
    let pool = db::connect(&database_url).await;

    let cards = db::list_cards(&pool).await.expect("failed to list cards");
    println!("Connected. Found {} card(s):", cards.len());
    for card in &cards {
        println!("  {} — {} ({})", card.id, card.title, card.stage);
    }
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be-rust && cargo build
```

Expected: clean compile (warnings about unused `create_card`/`get_card` are expected and fine — Task 2 wires them into HTTP handlers; do not add `#[allow(dead_code)]` or otherwise silence this, it's accurate and temporary).

Then, with the same local Postgres devpipe already uses running and reachable:

```bash
cargo run
```

Expected: prints `Connected. Found N card(s):` followed by one line per existing card in the database (devpipe likely already has real cards from prior sessions — that's fine, this just proves the query works against real data). If Postgres isn't reachable, the process will panic with "failed to connect to Postgres" — in that case, confirm Postgres is running before treating this as a code bug.

- [ ] **Step 5: Commit**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe
git add be-rust/Cargo.toml be-rust/Cargo.lock be-rust/src/db.rs be-rust/src/main.rs
git commit -m "feat: scaffold Rust backend Phase 0 — DB layer proof"
```

(`Cargo.lock` is generated by `cargo build` — include it, this is a binary crate, not a library, so the lockfile should be committed per Cargo convention.)

---

### Task 2: axum HTTP layer — the 3 endpoints

**Files:**
- Create: `be-rust/src/handlers.rs`
- Modify: `be-rust/src/main.rs` (full rewrite of the Task 1 version)

**Interfaces:**
- Consumes: `db::Card`, `db::connect`, `db::list_cards`, `db::get_card`, `db::create_card` from Task 1 (exact names/signatures above).
- Produces: a running HTTP service on `:8082` — no later task in this plan consumes it further (Phase 0 ends here; a future phase decides whether/how the frontend or Go backend ever talk to it).

- [ ] **Step 1: Create `be-rust/src/handlers.rs`**

```rust
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use sqlx::PgPool;

use crate::db::{self, Card};

#[derive(Deserialize)]
pub struct CreateCardRequest {
    pub title: String,
    #[serde(rename = "repoPath")]
    pub repo_path: String,
    #[serde(default = "default_agent")]
    pub agent: String,
}

fn default_agent() -> String {
    "claude".to_string()
}

pub async fn list_cards(State(pool): State<PgPool>) -> Result<Json<Vec<Card>>, (StatusCode, String)> {
    db::list_cards(&pool)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn create_card(
    State(pool): State<PgPool>,
    Json(req): Json<CreateCardRequest>,
) -> Result<Json<Card>, (StatusCode, String)> {
    db::create_card(&pool, &req.title, &req.repo_path, &req.agent)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn get_card(
    State(pool): State<PgPool>,
    Path(id): Path<String>,
) -> Result<Json<Card>, (StatusCode, String)> {
    match db::get_card(&pool, &id).await {
        Ok(Some(card)) => Ok(Json(card)),
        Ok(None) => Err((StatusCode::NOT_FOUND, "not found".to_string())),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
```

- [ ] **Step 2: Rewrite `be-rust/src/main.rs` to serve HTTP**

Replace the entire file (Task 1's DB-only proof version) with:

```rust
mod db;
mod handlers;

use axum::routing::get;
use axum::Router;

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://devpipe:devpipe@localhost:5432/devpipe?sslmode=disable".to_string());
    let pool = db::connect(&database_url).await;

    let app = Router::new()
        .route("/cards", get(handlers::list_cards).post(handlers::create_card))
        .route("/cards/:id", get(handlers::get_card))
        .with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8082")
        .await
        .expect("failed to bind :8082");
    println!("devpipe-rust listening on :8082");
    axum::serve(listener, app).await.expect("server error");
}
```

- [ ] **Step 3: Verify — build**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be-rust && cargo build
```

Expected: clean compile, no warnings this time (both `create_card`/`get_card` are now used via the handlers).

- [ ] **Step 4: Verify — real curl round-trip**

Start the service in one terminal:

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be-rust && cargo run
```

Expected console output: `devpipe-rust listening on :8082`.

In another terminal:

```bash
curl -s -X POST localhost:8082/cards \
  -H 'Content-Type: application/json' \
  -d '{"title":"rust-phase0-test","repoPath":"/tmp/whatever","agent":"claude"}' | python3 -m json.tool
```

Expected: a JSON object with a non-null, non-empty `activePrdId` — this is the one behavior most likely to be wrong if the transaction isn't implemented correctly (a bug here would show `activePrdId: null` or the request would 500 with a Postgres NOT NULL constraint violation). Note the returned `id`.

```bash
curl -s localhost:8082/cards | python3 -m json.tool
```

Expected: the test card appears, first in the list (most-recently-updated).

```bash
curl -s localhost:8082/cards/<id-from-create-response> | python3 -m json.tool
```

Expected: matches the create response.

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:8082/cards/nonexistent-id
```

Expected: `404`.

- [ ] **Step 5: Verify — Go backend sees the same data**

With the Rust service still running, in a third terminal, start Go (if not already running):

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be && go run ./cmd/api
```

```bash
curl -s localhost:8081/api/cards | python3 -m json.tool | grep -A2 rust-phase0-test
```

Expected: the same test card appears via Go's API too — proves both services are reading/writing the identical schema correctly, not two diverging views of the data. This is the actual point of Phase 0; do not skip this step even though it involves the other backend.

- [ ] **Step 6: Clean up the test card**

```bash
psql "postgres://devpipe:devpipe@localhost:5432/devpipe?sslmode=disable" -c "DELETE FROM cards WHERE title = 'rust-phase0-test';"
```

(Deleting by the test title, not a hardcoded id, since the id is generated fresh each run of Step 4. If `psql` isn't available, connect however devpipe's Postgres is normally accessed and run the equivalent `DELETE`. The `prds` row cascades via the `ON DELETE CASCADE` foreign key — confirmed in `be/migrations/0001_init.up.sql:29`, no separate cleanup needed for it.)

- [ ] **Step 7: Commit**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe
git add be-rust/src/handlers.rs be-rust/src/main.rs be-rust/Cargo.lock
git commit -m "feat: add axum HTTP layer to Rust backend Phase 0"
```

---

## Self-Review

**Spec coverage:** Directory/stack choice (axum+sqlx+tokio, port 8082, sibling to `be/`) ✓ Task 1 setup + Task 2 wiring. Data model with exact camelCase JSON field mapping ✓ Task 1 `db.rs`. All 3 endpoints ✓ Task 2 `handlers.rs`. `POST /cards`'s exact transaction (card + PRD + activation, atomic) ✓ Task 1's `create_card`. Error handling (500 with error string, 404 on missing card) ✓ Task 2 handlers. Testing section's full curl sequence, including the Go-backend cross-check and cleanup ✓ Task 2 Steps 4-6. Non-goals (no FE changes, no Go changes, no new migrations, no auth/CORS) — no task touches any of them ✓.

**Placeholder scan:** no TBD/TODO; every step has complete, real code; verification steps name exact commands and exact expected output, not "test it works."

**Type consistency:** `db::Card`'s field names (Task 1) match exactly what `handlers.rs` imports and serializes (Task 2) — same struct, no redefinition. `db::create_card`/`get_card`/`list_cards`'s signatures (Task 1: `pool: &PgPool, ...) -> Result<_, sqlx::Error>`) match exactly how `handlers.rs` calls them (Task 2). `CreateCardRequest`'s `repo_path`/`agent` fields feed `db::create_card`'s `repo_path: &str, agent: &str` parameters in the same order. Route path `/cards/:id` (Task 2) matches the `Path(id): Path<String>` extractor's expected single dynamic segment.
