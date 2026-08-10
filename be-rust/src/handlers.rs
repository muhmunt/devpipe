use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::{AgentDefinition, Repository, Worktree, WorktreeKind, WorktreeStatus, Workspace};
use crate::error::AppError;

pub fn routes() -> Router<crate::state::AppState> {
    Router::new()
        .route("/workspaces", get(list_workspaces).post(create_workspace))
        .route("/workspaces/:id", get(get_workspace))
        .route("/workspaces/:id/repositories", get(list_repositories))
        .route("/repositories", post(create_repository))
        .route("/repositories/:id", get(get_repository))
        .route("/repositories/:id/worktrees", post(create_worktree))
        .route("/worktrees/:id", get(get_worktree).delete(delete_worktree))
        .route("/worktrees/:id/diff", get(diff_worktree))
        .route("/agent-definitions", get(list_agent_definitions).post(create_agent_definition))
        .route("/agents/detect", get(detect_agents))
        .route("/editors/detect", get(detect_editors))
}

fn workspace_from_row(row: &sqlx::postgres::PgRow) -> Workspace {
    Workspace {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get("color"),
        icon: row.get("icon"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        last_opened_at: row.get("last_opened_at"),
    }
}

pub(crate) fn repository_from_row(row: &sqlx::postgres::PgRow) -> Repository {
    Repository {
        id: row.get("id"),
        workspace_id: row.get("workspace_id"),
        name: row.get("name"),
        local_path: row.get("local_path"),
        remote_url: row.get("remote_url"),
        default_branch: row.get("default_branch"),
        setup_script: row.get("setup_script"),
        run_script: row.get("run_script"),
        test_script: row.get("test_script"),
        teardown_script: row.get("teardown_script"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

pub(crate) fn worktree_from_row(row: &sqlx::postgres::PgRow) -> Result<Worktree, AppError> {
    let kind: String = row.get("kind");
    let status: String = row.get("status");
    Ok(Worktree {
        id: row.get("id"),
        repository_id: row.get("repository_id"),
        path: row.get("path"),
        branch: row.get("branch"),
        target_branch: row.get("target_branch"),
        kind: WorktreeKind::from_str(&kind)?,
        status: WorktreeStatus::from_str(&status)?,
        archived_at: row.get("archived_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

// --- workspaces ----------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorkspaceBody {
    name: String,
    color: Option<String>,
    icon: Option<String>,
}

async fn list_workspaces(State(pool): State<PgPool>) -> Result<Json<Vec<Workspace>>, AppError> {
    let rows = sqlx::query("SELECT * FROM workspaces ORDER BY created_at DESC")
        .fetch_all(&pool)
        .await?;
    Ok(Json(rows.iter().map(workspace_from_row).collect()))
}

async fn create_workspace(
    State(pool): State<PgPool>,
    Json(body): Json<CreateWorkspaceBody>,
) -> Result<Json<Workspace>, AppError> {
    let id = Uuid::new_v4();
    let now = Utc::now();
    let row = sqlx::query(
        "INSERT INTO workspaces (id, name, color, icon, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5) RETURNING *",
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.color)
    .bind(&body.icon)
    .bind(now)
    .fetch_one(&pool)
    .await?;
    Ok(Json(workspace_from_row(&row)))
}

async fn get_workspace(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<Workspace>, AppError> {
    let row = sqlx::query("SELECT * FROM workspaces WHERE id = $1")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(workspace_from_row(&row)))
}

// --- repositories ----------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRepositoryBody {
    workspace_id: Uuid,
    name: String,
    local_path: String,
    remote_url: Option<String>,
    default_branch: Option<String>,
}

async fn list_repositories(
    State(pool): State<PgPool>,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<Repository>>, AppError> {
    let rows = sqlx::query("SELECT * FROM repositories WHERE workspace_id = $1 ORDER BY created_at DESC")
        .bind(workspace_id)
        .fetch_all(&pool)
        .await?;
    Ok(Json(rows.iter().map(repository_from_row).collect()))
}

async fn create_repository(
    State(pool): State<PgPool>,
    Json(body): Json<CreateRepositoryBody>,
) -> Result<Json<Repository>, AppError> {
    let id = Uuid::new_v4();
    let now = Utc::now();
    let default_branch = body.default_branch.unwrap_or_else(|| "main".to_string());
    let row = sqlx::query(
        "INSERT INTO repositories (id, workspace_id, name, local_path, remote_url, default_branch, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *",
    )
    .bind(id)
    .bind(body.workspace_id)
    .bind(&body.name)
    .bind(&body.local_path)
    .bind(&body.remote_url)
    .bind(&default_branch)
    .bind(now)
    .fetch_one(&pool)
    .await?;
    Ok(Json(repository_from_row(&row)))
}

async fn get_repository(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<Repository>, AppError> {
    let row = sqlx::query("SELECT * FROM repositories WHERE id = $1")
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(repository_from_row(&row)))
}

// --- worktrees ----------------------------------------------------------

pub(crate) async fn fetch_repository(pool: &PgPool, id: Uuid) -> Result<Repository, AppError> {
    let row = sqlx::query("SELECT * FROM repositories WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(repository_from_row(&row))
}

pub(crate) async fn fetch_worktree(pool: &PgPool, id: Uuid) -> Result<Worktree, AppError> {
    let row = sqlx::query("SELECT * FROM worktrees WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(worktree_from_row(&row)?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWorktreeBody {
    branch: String,
    target_branch: Option<String>,
}

async fn create_worktree(
    State(pool): State<PgPool>,
    Path(repository_id): Path<Uuid>,
    Json(body): Json<CreateWorktreeBody>,
) -> Result<Json<Worktree>, AppError> {
    let repo = fetch_repository(&pool, repository_id).await?;
    let target_branch = body.target_branch.unwrap_or(repo.default_branch);
    let id = Uuid::new_v4();
    let repo_path = std::path::PathBuf::from(&repo.local_path);
    let worktree_path = repo_path.join(".worktrees").join(id.to_string());

    crate::git::worktree_add(&repo_path, &worktree_path, &body.branch, &target_branch).await?;

    let now = Utc::now();
    let row = sqlx::query(
        "INSERT INTO worktrees (id, repository_id, path, branch, target_branch, kind, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'task', 'clean', $6, $6) RETURNING *",
    )
    .bind(id)
    .bind(repository_id)
    .bind(worktree_path.to_string_lossy().to_string())
    .bind(&body.branch)
    .bind(&target_branch)
    .bind(now)
    .fetch_one(&pool)
    .await?;
    Ok(Json(worktree_from_row(&row)?))
}

async fn delete_worktree(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<(), AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    let repo = fetch_repository(&pool, worktree.repository_id).await?;

    crate::git::worktree_remove(
        std::path::Path::new(&repo.local_path),
        std::path::Path::new(&worktree.path),
    )
    .await?;

    sqlx::query("DELETE FROM worktrees WHERE id = $1").bind(id).execute(&pool).await?;
    Ok(())
}

async fn get_worktree(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<Json<Worktree>, AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    let target_branch = worktree.target_branch.clone().unwrap_or_else(|| "main".to_string());
    let fresh_status = crate::git::status(std::path::Path::new(&worktree.path), &target_branch).await?;

    let row = sqlx::query("UPDATE worktrees SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *")
        .bind(fresh_status.as_str())
        .bind(Utc::now())
        .bind(id)
        .fetch_one(&pool)
        .await?;
    Ok(Json(worktree_from_row(&row)?))
}

async fn diff_worktree(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<crate::domain::Diff>, AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    let target_branch = worktree.target_branch.unwrap_or_else(|| "main".to_string());
    let diff = crate::git::diff(std::path::Path::new(&worktree.path), &target_branch).await?;
    Ok(Json(diff))
}

// --- agent definitions + detection (Rung 4 / phase-r3, phase-r9.2/9.3) ---

pub(crate) fn agent_definition_from_row(row: &sqlx::postgres::PgRow) -> AgentDefinition {
    let default_args: sqlx::types::Json<Vec<String>> = row.get("default_args");
    AgentDefinition {
        id: row.get("id"),
        name: row.get("name"),
        executable: row.get("executable"),
        default_args: default_args.0,
        capabilities: row.get("capabilities"),
    }
}

async fn list_agent_definitions(State(pool): State<PgPool>) -> Result<Json<Vec<AgentDefinition>>, AppError> {
    let rows = sqlx::query("SELECT * FROM agent_definitions ORDER BY id").fetch_all(&pool).await?;
    Ok(Json(rows.iter().map(agent_definition_from_row).collect()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAgentDefinitionBody {
    id: String,
    name: String,
    executable: String,
    default_args: Vec<String>,
}

async fn create_agent_definition(
    State(pool): State<PgPool>,
    Json(body): Json<CreateAgentDefinitionBody>,
) -> Result<Json<AgentDefinition>, AppError> {
    let row = sqlx::query(
        "INSERT INTO agent_definitions (id, name, executable, default_args, capabilities)
         VALUES ($1, $2, $3, $4, '{}') RETURNING *",
    )
    .bind(&body.id)
    .bind(&body.name)
    .bind(&body.executable)
    .bind(sqlx::types::Json(&body.default_args))
    .fetch_one(&pool)
    .await?;
    Ok(Json(agent_definition_from_row(&row)))
}

async fn detect_agents(State(pool): State<PgPool>) -> Result<Json<std::collections::HashMap<String, bool>>, AppError> {
    let rows = sqlx::query("SELECT id, executable FROM agent_definitions").fetch_all(&pool).await?;
    let mut result = std::collections::HashMap::new();
    for row in rows {
        let id: String = row.get("id");
        let executable: String = row.get("executable");
        result.insert(id, crate::agents::detect_executable(&executable).await);
    }
    Ok(Json(result))
}

async fn detect_editors() -> Json<crate::editors::EditorAvailability> {
    Json(crate::editors::detect_all().await)
}
