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
