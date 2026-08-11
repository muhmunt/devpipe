//! Entity model + core traits — Rung 1 (phase-r0-architecture-entity-model.md).
//! Structs mirror the Postgres schema landing in Rung 2's migrations.
//! Field names are `camelCase` in JSON so frontend DTOs (phase-r5) map 1:1.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
}

pub type Result<T> = std::result::Result<T, DomainError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_opened_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub local_path: String,
    pub remote_url: Option<String>,
    pub default_branch: String,
    pub setup_script: Option<String>,
    pub run_script: Option<String>,
    pub test_script: Option<String>,
    pub teardown_script: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeKind {
    Primary,
    Task,
}

impl WorktreeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            WorktreeKind::Primary => "primary",
            WorktreeKind::Task => "task",
        }
    }

    pub fn from_str(s: &str) -> Result<Self> {
        match s {
            "primary" => Ok(WorktreeKind::Primary),
            "task" => Ok(WorktreeKind::Task),
            other => Err(DomainError::Invalid(format!("unknown worktree kind: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorktreeStatus {
    Clean,
    Modified,
    Conflicted,
    Ahead,
    Behind,
}

impl WorktreeStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            WorktreeStatus::Clean => "clean",
            WorktreeStatus::Modified => "modified",
            WorktreeStatus::Conflicted => "conflicted",
            WorktreeStatus::Ahead => "ahead",
            WorktreeStatus::Behind => "behind",
        }
    }

    pub fn from_str(s: &str) -> Result<Self> {
        match s {
            "clean" => Ok(WorktreeStatus::Clean),
            "modified" => Ok(WorktreeStatus::Modified),
            "conflicted" => Ok(WorktreeStatus::Conflicted),
            "ahead" => Ok(WorktreeStatus::Ahead),
            "behind" => Ok(WorktreeStatus::Behind),
            other => Err(DomainError::Invalid(format!("unknown worktree status: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub id: Uuid,
    pub repository_id: Uuid,
    pub path: String,
    pub branch: String,
    pub target_branch: Option<String>,
    pub kind: WorktreeKind,
    pub status: WorktreeStatus,
    pub archived_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Populated only by the list endpoint (sidebar `+N -M`). Left as None
    /// elsewhere so single-worktree reads don't pay for a git diff.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub additions: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deletions: Option<u32>,
    pub pinned_at: Option<DateTime<Utc>>,
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDefinition {
    pub id: String,
    pub name: String,
    pub executable: String,
    pub default_args: Vec<String>,
    pub capabilities: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Created,
    Starting,
    Running,
    NeedsInput,
    Waiting,
    Completed,
    Failed,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub worktree_id: Option<Uuid>,
    pub agent_definition_id: String,
    pub model: Option<String>,
    pub reasoning_level: Option<String>,
    pub status: SessionStatus,
    pub process_id: Option<i32>,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
    pub last_activity_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionEvent {
    pub id: Uuid,
    pub session_id: Uuid,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommandScope {
    Global,
    Workspace,
    Repository,
}

impl CommandScope {
    pub fn as_str(&self) -> &'static str {
        match self {
            CommandScope::Global => "global",
            CommandScope::Workspace => "workspace",
            CommandScope::Repository => "repository",
        }
    }

    pub fn from_str(s: &str) -> Result<Self> {
        match s {
            "global" => Ok(CommandScope::Global),
            "workspace" => Ok(CommandScope::Workspace),
            "repository" => Ok(CommandScope::Repository),
            other => Err(DomainError::Invalid(format!("unknown command scope: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    pub id: Uuid,
    pub scope: CommandScope,
    pub scope_id: Option<Uuid>,
    pub name: String,
    pub prompt: String,
    pub created_at: DateTime<Utc>,
}

// --- Normalized agent event protocol (Rung 5 / phase-r4) ---------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    SessionStarted { session_id: Uuid },
    MessageDelta { session_id: Uuid, role: String, text: String },
    ToolStarted { session_id: Uuid, tool: String, input: serde_json::Value },
    ToolOutput { session_id: Uuid, tool: String, output: String },
    FileChanged { session_id: Uuid, path: String },
    NeedsInput { session_id: Uuid, question: String },
    UsageUpdated { session_id: Uuid, tokens: Option<u64> },
    SessionIdle { session_id: Uuid },
    SessionCompleted { session_id: Uuid, exit_code: i32 },
    SessionError { session_id: Uuid, message: String },
}

// --- Worktree manager (Rung 3 / phase-r2) -------------------------------

#[derive(Debug, Clone)]
pub struct CreateWorktreeRequest {
    pub repository_id: Uuid,
    pub branch: String,
    pub target_branch: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Diff {
    pub files: Vec<DiffFile>,
    pub diff: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub author: String,
    pub date: String,
    pub message: String,
}

#[async_trait]
pub trait WorktreeManager: Send + Sync {
    async fn create(&self, req: CreateWorktreeRequest) -> Result<Worktree>;
    async fn remove(&self, id: Uuid) -> Result<()>;
    async fn status(&self, id: Uuid) -> Result<WorktreeStatus>;
    async fn diff(&self, id: Uuid, worktree_path: &PathBuf, target_branch: &str) -> Result<Diff>;
}

// --- Agent adapter (Rung 4 / phase-r3) ----------------------------------

#[derive(Debug, Clone)]
pub struct StartConfig {
    pub session_id: Uuid,
    pub worktree_path: PathBuf,
    pub model: Option<String>,
    pub reasoning_level: Option<String>,
    pub prompt: String,
}

#[async_trait]
pub trait SessionHandle: Send + Sync {
    fn id(&self) -> Uuid;
    fn events(&self) -> broadcast::Receiver<AgentEvent>;
    async fn send(&self, input: &str) -> Result<()>;
    async fn stop(&self) -> Result<()>;
}

#[async_trait]
pub trait AgentAdapter: Send + Sync {
    fn id(&self) -> &str;
    async fn detect(&self) -> Result<bool>;
    async fn start(&self, cfg: StartConfig) -> Result<Box<dyn SessionHandle>>;
}
