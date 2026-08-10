mod agents;
mod db;
mod domain;
mod editors;
mod error;
mod git;
mod handlers;
mod process_manager;
mod scripts;
mod sessions;
mod state;

use axum::Router;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use state::AppState;

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://devpipe:devpipe@localhost:5432/devpipe".to_string());
    let pool = db::connect(&database_url).await;

    // phase-r9.4: sessions left running/starting/needs_input/waiting from a
    // prior process have no backing OS process anymore — reconcile before
    // accepting any traffic.
    sessions::reconcile_orphaned_sessions(&pool).await;

    let state = AppState {
        pool,
        pm: Arc::new(process_manager::ProcessManager::new()),
        buses: Arc::new(Mutex::new(HashMap::new())),
        handles: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = Router::new()
        .nest("/api", handlers::routes().merge(sessions::routes()))
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8081")
        .await
        .expect("failed to bind :8081");
    println!("devpipe-rust listening on :8081");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(state))
        .await
        .expect("server error");
}

async fn shutdown_signal(state: AppState) {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.expect("failed to listen for ctrl_c");
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    println!("shutting down, terminating tracked agent processes...");
    state.pm.kill_all().await;
}
