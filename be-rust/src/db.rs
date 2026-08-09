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

// stage/agent/status are custom Postgres enum types (see `\d cards`), not
// TEXT — sqlx enforces strict OID compatibility when decoding into `String`
// (unlike Go's pgx, used by be/internal/db/cards.go, which decodes enums
// into `string` permissively). Explicit ::text casts here are the standard
// sqlx-side fix; the Rust `Card` struct still models them as `String`.
const CARD_COLUMNS: &str =
    "id, title, repo_path, branch, worktree_path, stage::text, agent::text, status::text, active_prd_id, active_plan_id, created_at, updated_at";

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
