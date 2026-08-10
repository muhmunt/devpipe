mod agents;
mod db;
mod domain;
mod editors;
mod error;
mod git;
mod handlers;
mod process_manager;

use axum::Router;

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://devpipe:devpipe@localhost:5432/devpipe".to_string());
    let pool = db::connect(&database_url).await;

    let app = Router::new().nest("/api", handlers::routes()).with_state(pool);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8081")
        .await
        .expect("failed to bind :8081");
    println!("devpipe-rust listening on :8081");
    axum::serve(listener, app).await.expect("server error");
}
