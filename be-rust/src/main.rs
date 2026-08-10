use axum::Router;

#[tokio::main]
async fn main() {
    let app = Router::new();

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8082")
        .await
        .expect("failed to bind :8082");
    println!("devpipe-rust listening on :8082");
    axum::serve(listener, app).await.expect("server error");
}
