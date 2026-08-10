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
