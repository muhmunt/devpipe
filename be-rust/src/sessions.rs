//! Event bus + session lifecycle (Rung 5 / phase-r4), folded with
//! phase-r9.4 (boot reconciliation) and phase-r9.5 (SSE batching).

use axum::extract::{Path, Query, State};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::{PgPool, Row};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

use crate::agents::{ClaudeAdapter, CursorAdapter, CustomCliAdapter};
use crate::domain::{AgentAdapter, AgentEvent, AgentSession, SessionHandle, StartConfig};
use crate::error::AppError;
use crate::handlers::{agent_definition_from_row, fetch_repository, fetch_worktree};
use crate::state::AppState;

pub type HandleRegistry = Arc<Mutex<HashMap<Uuid, Box<dyn SessionHandle>>>>;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/worktrees/:id/sessions", get(list_worktree_sessions).post(create_session))
        .route("/sessions/:id/events", get(stream_events))
        .route("/sessions/:id/timeline", get(timeline))
        .route("/sessions/:id/reply", post(reply))
        .route("/observability/sessions", get(list_sessions))
}

fn session_from_row(row: &sqlx::postgres::PgRow) -> AgentSession {
    let status: String = row.get("status");
    AgentSession {
        id: row.get("id"),
        workspace_id: row.get("workspace_id"),
        worktree_id: row.get("worktree_id"),
        agent_definition_id: row.get("agent_definition_id"),
        model: row.get("model"),
        reasoning_level: row.get("reasoning_level"),
        status: parse_status(&status),
        process_id: row.get("process_id"),
        started_at: row.get("started_at"),
        ended_at: row.get("ended_at"),
        last_activity_at: row.get("last_activity_at"),
        exit_code: row.get("exit_code"),
    }
}

fn parse_status(s: &str) -> crate::domain::SessionStatus {
    use crate::domain::SessionStatus::*;
    match s {
        "created" => Created,
        "starting" => Starting,
        "running" => Running,
        "needs_input" => NeedsInput,
        "waiting" => Waiting,
        "completed" => Completed,
        "failed" => Failed,
        _ => Stopped,
    }
}

async fn resolve_adapter(pool: &PgPool, pm: Arc<crate::process_manager::ProcessManager>, agent_definition_id: &str) -> Result<Box<dyn AgentAdapter>, AppError> {
    match agent_definition_id {
        "claude" => Ok(Box::new(ClaudeAdapter { pm })),
        "cursor" => Ok(Box::new(CursorAdapter { pm })),
        other => {
            let row = sqlx::query("SELECT * FROM agent_definitions WHERE id = $1")
                .bind(other)
                .fetch_optional(pool)
                .await?
                .ok_or(AppError::NotFound)?;
            let def = agent_definition_from_row(&row);
            Ok(Box::new(CustomCliAdapter { agent_id: def.id, executable: def.executable, default_args: def.default_args, pm }))
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionBody {
    agent_definition_id: String,
    model: Option<String>,
    reasoning_level: Option<String>,
    permission_mode: Option<String>,
    prompt: String,
    #[serde(default)]
    attachments: Vec<String>,
}

/// Attached files are worktree-relative paths picked from the repository's
/// own file list. Claude resolves `@path` mentions inside a prompt (verified
/// against a real `claude -p` run), so they're passed as mentions and the
/// agent reads them itself — inlining file contents into the prompt would
/// duplicate work the agent's Read tool already does and would blow up the
/// stored transcript for large files.
///
/// The composed text is what gets persisted as the person's turn, so the
/// transcript shows exactly what the agent was asked, mentions included.
fn compose_prompt(text: &str, attachments: &[String]) -> Result<String, AppError> {
    if attachments.is_empty() {
        return Ok(text.to_string());
    }
    for path in attachments {
        // Attachments name files inside the worktree. An absolute path or a
        // `..` escape would point the agent at the rest of the disk.
        if path.is_empty() || path.starts_with('/') || path.split('/').any(|seg| seg == "..") {
            return Err(AppError::Invalid(format!("attachment must be a path inside the worktree: {path}")));
        }
    }
    let mentions = attachments.iter().map(|p| format!("@{p}")).collect::<Vec<_>>().join("\n");
    Ok(if text.is_empty() { mentions } else { format!("{text}\n\n{mentions}") })
}

async fn create_session(
    State(state): State<AppState>,
    Path(worktree_id): Path<Uuid>,
    Json(body): Json<CreateSessionBody>,
) -> Result<Json<AgentSession>, AppError> {
    let worktree = fetch_worktree(&state.pool, worktree_id).await?;
    let repo = fetch_repository(&state.pool, worktree.repository_id).await?;
    // Validated before the session row is written, so a bad attachment can't
    // leave a dead session behind.
    let prompt = compose_prompt(&body.prompt, &body.attachments)?;

    let id = Uuid::new_v4();
    let now = Utc::now();
    sqlx::query(
        "INSERT INTO agent_sessions
         (id, workspace_id, worktree_id, agent_definition_id, model, reasoning_level, status, started_at, last_activity_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'starting', $7, $7)",
    )
    .bind(id)
    .bind(repo.workspace_id)
    .bind(worktree_id)
    .bind(&body.agent_definition_id)
    .bind(&body.model)
    .bind(&body.reasoning_level)
    .bind(now)
    .execute(&state.pool)
    .await?;

    // The prompt only ever reaches the CLI as a spawn argument — nothing in
    // its own stdout echoes it back, so without persisting it explicitly the
    // transcript would show every Claude reply with no question attached.
    persist_event(&state.pool, id, &AgentEvent::MessageDelta { session_id: id, role: "user".to_string(), text: prompt.clone() })
        .await;

    let adapter = resolve_adapter(&state.pool, state.pm.clone(), &body.agent_definition_id).await?;
    let start_result = adapter
        .start(StartConfig {
            session_id: id,
            worktree_path: std::path::PathBuf::from(&worktree.path),
            model: body.model.clone(),
            reasoning_level: body.reasoning_level.clone(),
            // Captured into the resume args at start, so every later turn of
            // this conversation keeps the permission the chat was opened
            // with rather than quietly changing it mid-way.
            permission_mode: body.permission_mode.clone(),
            prompt,
        })
        .await;

    let handle = match start_result {
        Ok(h) => h,
        Err(e) => {
            sqlx::query("UPDATE agent_sessions SET status = 'failed', ended_at = $2 WHERE id = $1")
                .bind(id)
                .bind(Utc::now())
                .execute(&state.pool)
                .await?;
            return Err(e.into());
        }
    };

    let (bus_tx, _bus_rx) = broadcast::channel::<AgentEvent>(1024);
    state.buses.lock().await.insert(id, bus_tx.clone());

    // Subscribing here triggers the adapter's deferred forwarding (agents.rs) —
    // this is the single reader of the adapter's internal channel; it persists
    // durably, then republishes to `bus_tx` for SSE consumers.
    let rx = handle.events();
    tokio::spawn(persist_and_broadcast(state.pool.clone(), id, bus_tx, rx));

    state.handles.lock().await.insert(id, handle);

    sqlx::query("UPDATE agent_sessions SET status = 'running' WHERE id = $1").bind(id).execute(&state.pool).await?;

    let row = sqlx::query("SELECT * FROM agent_sessions WHERE id = $1").bind(id).fetch_one(&state.pool).await?;
    Ok(Json(session_from_row(&row)))
}

fn event_type_tag(event: &AgentEvent) -> &'static str {
    match event {
        AgentEvent::SessionStarted { .. } => "session_started",
        AgentEvent::MessageDelta { .. } => "message_delta",
        AgentEvent::Thinking { .. } => "thinking",
        AgentEvent::ToolStarted { .. } => "tool_started",
        AgentEvent::ToolOutput { .. } => "tool_output",
        AgentEvent::FileChanged { .. } => "file_changed",
        AgentEvent::NeedsInput { .. } => "needs_input",
        AgentEvent::UsageUpdated { .. } => "usage_updated",
        AgentEvent::SessionIdle { .. } => "session_idle",
        AgentEvent::SessionCompleted { .. } => "session_completed",
        AgentEvent::SessionError { .. } => "session_error",
    }
}

async fn apply_status_transition(pool: &PgPool, session_id: Uuid, event: &AgentEvent) {
    let (status, exit_code): (Option<&str>, Option<i32>) = match event {
        AgentEvent::NeedsInput { .. } => (Some("needs_input"), None),
        AgentEvent::SessionIdle { .. } => (Some("waiting"), None),
        AgentEvent::SessionCompleted { exit_code, .. } => {
            (Some(if *exit_code == 0 { "completed" } else { "failed" }), Some(*exit_code))
        }
        AgentEvent::SessionError { .. } => (Some("failed"), None),
        _ => (None, None),
    };
    if let Some(status) = status {
        let _ = sqlx::query(
            "UPDATE agent_sessions SET status = $1, exit_code = COALESCE($2, exit_code),
             ended_at = CASE WHEN $1 IN ('completed','failed','stopped') THEN now() ELSE ended_at END,
             last_activity_at = now() WHERE id = $3",
        )
        .bind(status)
        .bind(exit_code)
        .bind(session_id)
        .execute(pool)
        .await;
    } else {
        let _ = sqlx::query("UPDATE agent_sessions SET last_activity_at = now() WHERE id = $1")
            .bind(session_id)
            .execute(pool)
            .await;
    }
}

/// Durably records one event — shared by the adapter-event reader below and
/// by the user's own turns (`create_session`, `reply`), which have no
/// adapter stream of their own to flow through.
async fn persist_event(pool: &PgPool, session_id: Uuid, event: &AgentEvent) {
    let payload = serde_json::to_value(event).unwrap_or(serde_json::json!({}));
    let _ = sqlx::query(
        "INSERT INTO session_events (id, session_id, event_type, payload, created_at)
         VALUES ($1, $2, $3, $4, now())",
    )
    .bind(Uuid::new_v4())
    .bind(session_id)
    .bind(event_type_tag(event))
    .bind(payload)
    .execute(pool)
    .await;
}

/// Single reader of an adapter's event channel: writes each event durably
/// (session_events) before republishing to the SSE bus — phase-r4.2's
/// ordering guarantee, so a slow/disconnected SSE client never loses history.
async fn persist_and_broadcast(
    pool: PgPool,
    session_id: Uuid,
    bus_tx: broadcast::Sender<AgentEvent>,
    mut rx: broadcast::Receiver<AgentEvent>,
) {
    loop {
        match rx.recv().await {
            Ok(event) => {
                persist_event(&pool, session_id, &event).await;
                apply_status_transition(&pool, session_id, &event).await;
                let _ = bus_tx.send(event);
            }
            Err(broadcast::error::RecvError::Lagged(n)) => {
                eprintln!("session {session_id}: event bus lagged, {n} events dropped from live view (durable log unaffected)");
                continue;
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}

#[derive(Deserialize)]
struct SinceParams {
    since: Option<DateTime<Utc>>,
}

/// Adds an `at` field to an event's JSON. Kept out of `AgentEvent` itself:
/// the same event is broadcast to several subscribers and replayed from the
/// log, and the time that matters is when it was recorded, not when the
/// struct was built.
fn stamp(payload: &mut serde_json::Value, at: DateTime<Utc>) {
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("at".to_string(), serde_json::json!(at));
    }
}

fn stamped(event: &AgentEvent, at: DateTime<Utc>) -> serde_json::Value {
    let mut payload = serde_json::to_value(event).unwrap_or(serde_json::json!({}));
    stamp(&mut payload, at);
    payload
}

/// SSE stream: replays persisted history (optionally from `?since=`), then
/// tails live events. MessageDelta events are batched into ~75ms windows
/// (phase-r9.5) so a verbose session doesn't send one SSE frame per line;
/// every other event type is forwarded immediately.
async fn stream_events(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(params): Query<SinceParams>,
) -> Sse<impl futures_core::Stream<Item = Result<Event, std::convert::Infallible>>> {
    let pool = state.pool.clone();
    let mut live_rx = {
        let mut buses = state.buses.lock().await;
        buses.entry(id).or_insert_with(|| broadcast::channel(1024).0).subscribe()
    };

    let stream = async_stream::stream! {
        let replay_rows = sqlx::query(
            "SELECT event_type, payload, created_at FROM session_events
             WHERE session_id = $1 AND ($2::timestamptz IS NULL OR created_at > $2)
             ORDER BY created_at",
        )
        .bind(id)
        .bind(params.since)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        for row in replay_rows {
            let event_type: String = row.get("event_type");
            let mut payload: serde_json::Value = row.get("payload");
            // Replayed history carries the time it actually happened; a live
            // event is stamped as it goes out. Without this the transcript
            // could only ever show "now", which is wrong for every message
            // that arrived before the tab was opened.
            stamp(&mut payload, row.get("created_at"));
            yield Ok(Event::default().event(event_type).json_data(payload).unwrap_or_else(|_| Event::default()));
        }

        let mut buffer: Vec<serde_json::Value> = Vec::new();
        let mut interval = tokio::time::interval(Duration::from_millis(75));
        loop {
            tokio::select! {
                msg = live_rx.recv() => {
                    match msg {
                        Ok(event @ AgentEvent::MessageDelta { .. }) => buffer.push(stamped(&event, Utc::now())),
                        Ok(other) => {
                            if !buffer.is_empty() {
                                yield Ok(Event::default().event("message_delta_batch").json_data(&buffer).unwrap_or_else(|_| Event::default()));
                                buffer.clear();
                            }
                            let payload = stamped(&other, Utc::now());
                            yield Ok(Event::default().event(event_type_tag(&other)).json_data(&payload).unwrap_or_else(|_| Event::default()));
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        yield Ok(Event::default().event("message_delta_batch").json_data(&buffer).unwrap_or_else(|_| Event::default()));
                        buffer.clear();
                    }
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Groups consecutive same-role MessageDelta rows into one message; every
/// other event type passes through as its own timeline entry.
async fn timeline(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<Json<Vec<serde_json::Value>>, AppError> {
    let rows = sqlx::query("SELECT event_type, payload, created_at FROM session_events WHERE session_id = $1 ORDER BY created_at")
        .bind(id)
        .fetch_all(&pool)
        .await?;

    let mut out: Vec<serde_json::Value> = Vec::new();
    for row in rows {
        let event_type: String = row.get("event_type");
        let payload: serde_json::Value = row.get("payload");

        if event_type == "message_delta" {
            let role = payload.get("role").cloned().unwrap_or_default();
            let text = payload.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if let Some(last) = out.last_mut() {
                if last.get("type") == Some(&serde_json::json!("message")) && last.get("role") == Some(&role) {
                    // Deltas are exact substrings of the final text (own
                    // embedded whitespace, no separator needed) for Claude's
                    // token stream; raw_passthrough (agents.rs) embeds its
                    // own trailing "\n" per line for the same reason.
                    let existing = last.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    last["text"] = serde_json::json!(format!("{existing}{text}"));
                    continue;
                }
            }
            out.push(serde_json::json!({ "type": "message", "role": role, "text": text }));
        } else {
            let mut entry = payload.clone();
            entry["type"] = serde_json::json!(event_type);
            out.push(entry);
        }
    }
    Ok(Json(out))
}

#[derive(Deserialize)]
struct ReplyBody {
    input: String,
    #[serde(default)]
    attachments: Vec<String>,
}

/// Carries the next turn of a conversation: while a session is waiting, the
/// reply goes through its still-open SessionHandle. Claude resumes the same
/// conversation (agents.rs); agents whose CLI has no way to set or recover a
/// conversation id answer with a clean 422 rather than silently starting a
/// fresh, context-free chat.
async fn reply(State(state): State<AppState>, Path(id): Path<Uuid>, Json(body): Json<ReplyBody>) -> Result<(), AppError> {
    let input = compose_prompt(&body.input, &body.attachments)?;
    let handles = state.handles.lock().await;
    let handle = handles.get(&id).ok_or(AppError::NotFound)?;

    // Unlike create_session, a live SSE viewer is already connected here —
    // persisting alone (as at session creation) isn't enough, it also has
    // to go out over the bus so the open tab shows it without a reload.
    let user_event = AgentEvent::MessageDelta { session_id: id, role: "user".to_string(), text: input.clone() };
    persist_event(&state.pool, id, &user_event).await;
    if let Some(bus_tx) = state.buses.lock().await.get(&id) {
        let _ = bus_tx.send(user_event);
    }

    handle.send(&input).await?;
    sqlx::query("UPDATE agent_sessions SET status = 'running' WHERE id = $1").bind(id).execute(&state.pool).await?;
    Ok(())
}

/// Boot-time reconciliation (phase-r9.4): sessions left `running`/`starting`/
/// `needs_input`/`waiting` when the server last stopped have no backing
/// process anymore (the in-memory ProcessManager/handle registry doesn't
/// survive a restart) — mark them failed with a clear reason instead of
/// leaving them stuck forever.
pub async fn reconcile_orphaned_sessions(pool: &PgPool) {
    let rows = sqlx::query(
        "UPDATE agent_sessions SET status = 'failed', ended_at = now()
         WHERE status IN ('created','starting','running','needs_input','waiting')
         RETURNING id",
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for row in rows {
        let id: Uuid = row.get("id");
        let _ = sqlx::query(
            "INSERT INTO session_events (id, session_id, event_type, payload, created_at)
             VALUES ($1, $2, 'session_error', $3, now())",
        )
        .bind(Uuid::new_v4())
        .bind(id)
        .bind(serde_json::json!({ "session_id": id, "message": "interrupted by server restart" }))
        .execute(pool)
        .await;
        eprintln!("reconciled orphaned session {id} -> failed (server restart)");
    }
}

/// Every chat that has run against this worktree, newest first, so the UI can
/// keep them side by side instead of replacing one with the next.
async fn list_worktree_sessions(
    State(pool): State<PgPool>,
    Path(worktree_id): Path<Uuid>,
) -> Result<Json<Vec<AgentSession>>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM agent_sessions WHERE worktree_id = $1 ORDER BY started_at DESC NULLS LAST",
    )
    .bind(worktree_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows.iter().map(session_from_row).collect()))
}

#[derive(Deserialize)]
struct ListSessionsParams {
    #[serde(rename = "workspaceId")]
    workspace_id: Option<Uuid>,
}

/// Observability dashboard data (spec §43) — real fields only. No
/// tokens/cost/files-changed/tests columns: no adapter currently reports
/// usage, and no adapter emits FileChanged or test-result events (Rung 4's
/// spawn_and_stream only produces SessionStarted/MessageDelta/
/// SessionCompleted/SessionError). Fabricating those columns would violate
/// the "ship what's real" rule from phase-r8 — add them here once an
/// adapter actually populates the underlying data, not before.
async fn list_sessions(
    State(pool): State<PgPool>,
    Query(params): Query<ListSessionsParams>,
) -> Result<Json<Vec<AgentSession>>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM agent_sessions WHERE ($1::uuid IS NULL OR workspace_id = $1) ORDER BY started_at DESC NULLS LAST",
    )
    .bind(params.workspace_id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows.iter().map(session_from_row).collect()))
}
