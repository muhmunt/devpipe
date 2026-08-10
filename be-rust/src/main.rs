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
