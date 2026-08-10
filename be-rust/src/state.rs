use axum::extract::FromRef;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

use crate::domain::AgentEvent;
use crate::process_manager::ProcessManager;
use crate::sessions::HandleRegistry;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub pm: Arc<ProcessManager>,
    // Per-session SSE fan-out bus. Separate from the adapter's internal
    // broadcast channel (agents.rs) — this one is what HTTP SSE clients
    // subscribe to; the persistence task is the single reader of the
    // adapter's channel and republishes here after writing to Postgres,
    // satisfying phase-r4.2's "durable write, then broadcast" ordering.
    pub buses: Arc<Mutex<HashMap<Uuid, broadcast::Sender<AgentEvent>>>>,
    // Live SessionHandle per running session — needed for reply()/stop() to
    // reach the still-open adapter process after launch.
    pub handles: HandleRegistry,
}

impl FromRef<AppState> for PgPool {
    fn from_ref(state: &AppState) -> PgPool {
        state.pool.clone()
    }
}
