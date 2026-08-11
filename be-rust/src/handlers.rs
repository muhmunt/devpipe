use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::{AgentDefinition, Command, CommandScope, Repository, Worktree, WorktreeKind, WorktreeStatus, Workspace};
use crate::error::AppError;

pub fn routes() -> Router<crate::state::AppState> {
    Router::new()
        .route("/workspaces", get(list_workspaces).post(create_workspace))
        .route("/workspaces/:id", get(get_workspace).patch(update_workspace).delete(delete_workspace))
        .route("/workspaces/init", post(init_workspace))
        .route("/workspaces/:id/repositories", get(list_repositories))
        .route("/repositories", post(create_repository))
        .route("/repositories/clone", post(clone_repository))
        .route("/repositories/:id", get(get_repository).patch(update_repository).delete(delete_repository))
        .route("/repositories/:id/branches", get(list_branches))
        .route("/repositories/:id/worktrees", get(list_worktrees).post(create_worktree))
        .route("/worktrees/:id", get(get_worktree).patch(update_worktree).delete(delete_worktree))
        .route("/worktrees/:id/diff", get(diff_worktree))
        .route("/worktrees/:id/commit", post(commit_worktree))
        .route("/worktrees/:id/push", post(push_worktree))
        .route("/worktrees/:id/files", get(list_files))
        .route("/worktrees/:id/commits", get(list_commits))
        .route("/worktrees/:id/run-script", post(run_script))
        .route("/agent-definitions", get(list_agent_definitions).post(create_agent_definition))
        .route("/agents/detect", get(detect_agents))
        .route("/editors/detect", get(detect_editors))
        .route("/commands", get(list_commands).post(create_command))
        .route("/fs/browse", get(browse_fs))
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
        additions: None,
        deletions: None,
        pinned_at: row.get("pinned_at"),
        favorite: row.get("favorite"),
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitWorkspaceBody {
    name: String,
    /// "open" uses an existing local repo at `path`; "clone" clones
    /// `cloneUrl` into `path` first.
    source: String,
    path: String,
    clone_url: Option<String>,
    default_branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InitWorkspaceResponse {
    workspace: Workspace,
    repository: Repository,
}

/// Creates a workspace and its first repository as one unit (spec §58
/// first-launch flow). Everything is validated *before* the workspace row
/// is written, and both inserts share a transaction, so a bad path or a
/// failed clone can't leave an orphaned empty workspace behind — which is
/// exactly what the previous two-call frontend flow did on every typo.
async fn init_workspace(
    State(pool): State<PgPool>,
    Json(body): Json<InitWorkspaceBody>,
) -> Result<Json<InitWorkspaceResponse>, AppError> {
    let path = std::path::Path::new(&body.path);
    crate::git::validate_path(path)?;

    match body.source.as_str() {
        "clone" => {
            let url = body.clone_url.as_deref().unwrap_or_default();
            if url.trim().is_empty() {
                return Err(AppError::Invalid("cloneUrl is required when source is \"clone\"".into()));
            }
            // Clone first: if it fails, nothing has been written to the DB.
            crate::git::clone(url, path).await?;
        }
        "new" => {
            // Creates the directory, git init, and an initial commit. Without
            // a HEAD the repository cannot have worktrees at all.
            crate::git::init(path, body.default_branch.as_deref().unwrap_or("main")).await?;
        }
        "open" => {
            if !path.exists() {
                return Err(AppError::Invalid(format!("path does not exist: {}", body.path)));
            }
            if !crate::git::is_git_repo(path).await {
                return Err(AppError::Invalid(format!("not a git repository: {}", body.path)));
            }
        }
        other => return Err(AppError::Invalid(format!("unknown source: {other}"))),
    }

    let mut tx = pool.begin().await?;
    let now = Utc::now();
    let workspace_id = Uuid::new_v4();
    let ws_row = sqlx::query(
        "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING *",
    )
    .bind(workspace_id)
    .bind(&body.name)
    .bind(now)
    .fetch_one(&mut *tx)
    .await?;

    let repo_row = sqlx::query(
        "INSERT INTO repositories (id, workspace_id, name, local_path, remote_url, default_branch, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING *",
    )
    .bind(Uuid::new_v4())
    .bind(workspace_id)
    .bind(&body.name)
    .bind(&body.path)
    .bind(&body.clone_url)
    .bind(body.default_branch.unwrap_or_else(|| "main".to_string()))
    .bind(now)
    .fetch_one(&mut *tx)
    .await?;

    let repo = repository_from_row(&repo_row);
    insert_primary_worktree(&mut tx, repo.id, &repo.local_path, &repo.default_branch).await?;

    tx.commit().await?;
    Ok(Json(InitWorkspaceResponse {
        workspace: workspace_from_row(&ws_row),
        repository: repository_from_row(&repo_row),
    }))
}

/// Removes the git worktrees devpipe created for this workspace, then
/// deletes the workspace (repositories/worktrees cascade). Never touches
/// the repository source directory itself — devpipe didn't create the
/// user's code and must not delete it.
async fn delete_workspace(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<(), AppError> {
    let rows = sqlx::query(
        "SELECT w.path AS worktree_path, r.local_path AS repo_path
         FROM worktrees w JOIN repositories r ON r.id = w.repository_id
         WHERE r.workspace_id = $1",
    )
    .bind(id)
    .fetch_all(&pool)
    .await?;

    for row in rows {
        let worktree_path: String = row.get("worktree_path");
        let repo_path: String = row.get("repo_path");
        if let Err(e) = crate::git::worktree_remove(
            std::path::Path::new(&repo_path),
            std::path::Path::new(&worktree_path),
        )
        .await
        {
            // Best effort: a worktree already gone from disk shouldn't block
            // cleanup of the database rows.
            eprintln!("workspace {id}: could not remove worktree {worktree_path}: {e}");
        }
    }

    let result = sqlx::query("DELETE FROM workspaces WHERE id = $1").bind(id).execute(&pool).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
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
    let path = std::path::Path::new(&body.local_path);
    crate::git::validate_path(path)?;
    if !path.exists() {
        return Err(AppError::Invalid(format!("path does not exist: {}", body.local_path)));
    }
    if !crate::git::is_git_repo(path).await {
        return Err(AppError::Invalid(format!("not a git repository: {}", body.local_path)));
    }
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloneRepositoryBody {
    workspace_id: Uuid,
    name: String,
    clone_url: String,
    dest_path: String,
    default_branch: Option<String>,
}

async fn clone_repository(
    State(pool): State<PgPool>,
    Json(body): Json<CloneRepositoryBody>,
) -> Result<Json<Repository>, AppError> {
    let dest = std::path::Path::new(&body.dest_path);
    crate::git::clone(&body.clone_url, dest).await?;

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
    .bind(&body.dest_path)
    .bind(&body.clone_url)
    .bind(&default_branch)
    .bind(now)
    .fetch_one(&pool)
    .await?;
    Ok(Json(repository_from_row(&row)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRepositoryScriptsBody {
    name: Option<String>,
    setup_script: Option<String>,
    run_script: Option<String>,
    test_script: Option<String>,
    teardown_script: Option<String>,
}

async fn update_repository(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateRepositoryScriptsBody>,
) -> Result<Json<Repository>, AppError> {
    let row = sqlx::query(
        "UPDATE repositories SET
            name            = COALESCE($7, name),
            setup_script    = $1,
            run_script      = $2,
            test_script     = $3,
            teardown_script = $4,
            updated_at      = $5
         WHERE id = $6 RETURNING *",
    )
    .bind(&body.setup_script)
    .bind(&body.run_script)
    .bind(&body.test_script)
    .bind(&body.teardown_script)
    .bind(Utc::now())
    .bind(id)
    .bind(&body.name)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(repository_from_row(&row)))
}

/// Shared by every repository-creation path so a repository always has a row
/// representing its own checkout. Without it the main branch is not
/// selectable and no session can run against it.
pub(crate) async fn insert_primary_worktree(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    repository_id: Uuid,
    local_path: &str,
    default_branch: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO worktrees (id, repository_id, path, branch, target_branch, kind, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4, 'primary', 'clean', now(), now())
         ON CONFLICT (repository_id, path) DO NOTHING",
    )
    .bind(Uuid::new_v4())
    .bind(repository_id)
    .bind(local_path)
    .bind(default_branch)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateWorkspaceBody {
    name: String,
}

async fn update_workspace(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateWorkspaceBody>,
) -> Result<Json<Workspace>, AppError> {
    let row = sqlx::query("UPDATE workspaces SET name = $1, updated_at = now() WHERE id = $2 RETURNING *")
        .bind(&body.name)
        .bind(id)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(workspace_from_row(&row)))
}

/// Removes devpipe's task worktrees for this repository, then the row. The
/// repository directory itself is never deleted: devpipe did not create the
/// user's code.
async fn delete_repository(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<(), AppError> {
    let repo = fetch_repository(&pool, id).await?;
    let rows = sqlx::query("SELECT path FROM worktrees WHERE repository_id = $1 AND kind = 'task'")
        .bind(id)
        .fetch_all(&pool)
        .await?;
    for row in rows {
        let wt_path: String = row.get("path");
        if let Err(e) = crate::git::worktree_remove(
            std::path::Path::new(&repo.local_path),
            std::path::Path::new(&wt_path),
        )
        .await
        {
            eprintln!("repository {id}: could not remove worktree {wt_path}: {e}");
        }
    }
    let result = sqlx::query("DELETE FROM repositories WHERE id = $1").bind(id).execute(&pool).await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(())
}

/// Local branches, for the "branch from" picker.
async fn list_branches(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<Json<Vec<String>>, AppError> {
    let repo = fetch_repository(&pool, id).await?;
    let branches = crate::git::list_branches(std::path::Path::new(&repo.local_path)).await?;
    Ok(Json(branches))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateWorktreeBody {
    pinned: Option<bool>,
    favorite: Option<bool>,
    target_branch: Option<String>,
}

async fn update_worktree(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateWorktreeBody>,
) -> Result<Json<Worktree>, AppError> {
    if let Some(target) = &body.target_branch {
        crate::git::validate_branch_name(target)?;
    }
    let row = sqlx::query(
        "UPDATE worktrees SET
            pinned_at     = CASE WHEN $1::bool IS NULL THEN pinned_at
                                 WHEN $1 THEN COALESCE(pinned_at, now())
                                 ELSE NULL END,
            favorite      = COALESCE($2, favorite),
            target_branch = COALESCE($3, target_branch),
            updated_at    = now()
         WHERE id = $4 RETURNING *",
    )
    .bind(body.pinned)
    .bind(body.favorite)
    .bind(&body.target_branch)
    .bind(id)
    .fetch_optional(&pool)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(worktree_from_row(&row)?))
}

async fn browse_fs(Query(params): Query<BrowseParams>) -> Result<Json<crate::fsbrowse::BrowseResult>, AppError> {
    Ok(Json(crate::fsbrowse::browse(params.path.as_deref()).await?))
}

#[derive(Deserialize)]
struct BrowseParams {
    path: Option<String>,
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

async fn list_worktrees(
    State(pool): State<PgPool>,
    Path(repository_id): Path<Uuid>,
) -> Result<Json<Vec<Worktree>>, AppError> {
    // Repositories created before primary worktrees existed have no row for
    // their own checkout. Create it lazily here rather than in a migration
    // that would have to guess paths.
    let repo = fetch_repository(&pool, repository_id).await?;
    let mut tx = pool.begin().await?;
    insert_primary_worktree(&mut tx, repo.id, &repo.local_path, &repo.default_branch).await?;
    tx.commit().await?;

    let rows = sqlx::query(
        "SELECT * FROM worktrees WHERE repository_id = $1 AND archived_at IS NULL
         ORDER BY (kind = 'primary') DESC, (pinned_at IS NOT NULL) DESC, pinned_at DESC, updated_at DESC",
    )
        .bind(repository_id)
        .fetch_all(&pool)
        .await?;
    let worktrees: Vec<Worktree> = rows.iter().map(worktree_from_row).collect::<Result<_, _>>()?;

    // Diff stats for the sidebar, computed concurrently: one cheap
    // `git diff --shortstat` per worktree rather than N sequential calls.
    let stats = futures::future::join_all(worktrees.iter().map(|wt| {
        let path = wt.path.clone();
        let target = wt.target_branch.clone().unwrap_or_else(|| "main".to_string());
        let is_primary = wt.kind == crate::domain::WorktreeKind::Primary;
        async move {
            if is_primary {
                (0, 0)
            } else {
                crate::git::diff_stat(std::path::Path::new(&path), &target).await
            }
        }
    }))
    .await;

    let worktrees = worktrees
        .into_iter()
        .zip(stats)
        .map(|(mut wt, (additions, deletions))| {
            wt.additions = Some(additions);
            wt.deletions = Some(deletions);
            wt
        })
        .collect();
    Ok(Json(worktrees))
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
    Ok(Json(refresh_worktree_status(&pool, &worktree).await?))
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

/// Recomputes and persists a worktree's status, matching get_worktree's
/// write-through pattern — used after any git operation that changes it.
async fn refresh_worktree_status(pool: &PgPool, worktree: &Worktree) -> Result<Worktree, AppError> {
    let target_branch = worktree.target_branch.clone().unwrap_or_else(|| "main".to_string());
    let fresh_status = crate::git::status(std::path::Path::new(&worktree.path), &target_branch).await?;
    let row = sqlx::query("UPDATE worktrees SET status = $1, updated_at = $2 WHERE id = $3 RETURNING *")
        .bind(fresh_status.as_str())
        .bind(Utc::now())
        .bind(worktree.id)
        .fetch_one(pool)
        .await?;
    Ok(worktree_from_row(&row)?)
}

#[derive(Deserialize)]
struct CommitBody {
    message: String,
}

async fn commit_worktree(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<CommitBody>,
) -> Result<Json<Worktree>, AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    crate::git::commit(std::path::Path::new(&worktree.path), &body.message).await?;
    Ok(Json(refresh_worktree_status(&pool, &worktree).await?))
}

async fn push_worktree(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<Json<Worktree>, AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    crate::git::push(std::path::Path::new(&worktree.path), &worktree.branch).await?;
    Ok(Json(refresh_worktree_status(&pool, &worktree).await?))
}

async fn list_files(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> Result<Json<Vec<String>>, AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    let files = crate::git::list_files(std::path::Path::new(&worktree.path)).await?;
    Ok(Json(files))
}

async fn list_commits(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
) -> Result<Json<Vec<crate::domain::Commit>>, AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    let commits = crate::git::commits(std::path::Path::new(&worktree.path), 30).await?;
    Ok(Json(commits))
}

#[derive(Deserialize)]
struct RunScriptBody {
    script: String,
}

async fn run_script(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(body): Json<RunScriptBody>,
) -> Result<Json<crate::scripts::ScriptOutput>, AppError> {
    let worktree = fetch_worktree(&pool, id).await?;
    let repo = fetch_repository(&pool, worktree.repository_id).await?;

    let script_text = match body.script.as_str() {
        "setup" => repo.setup_script,
        "run" => repo.run_script,
        "test" => repo.test_script,
        "teardown" => repo.teardown_script,
        other => return Err(AppError::Invalid(format!("unknown script kind: {other}"))),
    };
    let script_text = script_text.ok_or_else(|| AppError::Invalid(format!("no {} script configured for this repository", body.script)))?;

    let output = crate::scripts::run(std::path::Path::new(&worktree.path), &script_text).await?;
    Ok(Json(output))
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

// --- custom commands (spec §27) ------------------------------------------

fn command_from_row(row: &sqlx::postgres::PgRow) -> Result<Command, AppError> {
    let scope: String = row.get("scope");
    Ok(Command {
        id: row.get("id"),
        scope: CommandScope::from_str(&scope)?,
        scope_id: row.get("scope_id"),
        name: row.get("name"),
        prompt: row.get("prompt"),
        created_at: row.get("created_at"),
    })
}

#[derive(Deserialize)]
struct ListCommandsParams {
    #[serde(rename = "workspaceId")]
    workspace_id: Option<Uuid>,
    #[serde(rename = "repositoryId")]
    repository_id: Option<Uuid>,
}

/// Global commands always apply; workspace/repository-scoped ones only
/// apply when the caller's current context matches — this is the set a
/// composer's `/` menu should offer.
async fn list_commands(
    State(pool): State<PgPool>,
    Query(params): Query<ListCommandsParams>,
) -> Result<Json<Vec<Command>>, AppError> {
    let rows = sqlx::query(
        "SELECT * FROM commands WHERE scope = 'global'
            OR (scope = 'workspace' AND scope_id = $1)
            OR (scope = 'repository' AND scope_id = $2)
         ORDER BY name",
    )
    .bind(params.workspace_id)
    .bind(params.repository_id)
    .fetch_all(&pool)
    .await?;
    let commands: Result<Vec<Command>, AppError> = rows.iter().map(command_from_row).collect();
    Ok(Json(commands?))
}

#[derive(Deserialize)]
struct CreateCommandBody {
    scope: String,
    #[serde(rename = "scopeId")]
    scope_id: Option<Uuid>,
    name: String,
    prompt: String,
}

async fn create_command(
    State(pool): State<PgPool>,
    Json(body): Json<CreateCommandBody>,
) -> Result<Json<Command>, AppError> {
    let scope = CommandScope::from_str(&body.scope)?;
    if scope != CommandScope::Global && body.scope_id.is_none() {
        return Err(AppError::Invalid("scopeId is required for workspace/repository-scoped commands".into()));
    }
    let id = Uuid::new_v4();
    let row = sqlx::query(
        "INSERT INTO commands (id, scope, scope_id, name, prompt, created_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING *",
    )
    .bind(id)
    .bind(scope.as_str())
    .bind(body.scope_id)
    .bind(&body.name)
    .bind(&body.prompt)
    .fetch_one(&pool)
    .await?;
    Ok(Json(command_from_row(&row)?))
}
