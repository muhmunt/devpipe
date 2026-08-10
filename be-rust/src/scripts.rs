//! Workspace scripts (spec §26): setup/run/test/teardown commands stored on
//! `repositories`, executed against a worktree's path. These are
//! user-configured shell scripts, not sandboxed — consistent with the
//! app's existing no-auth, single-trusted-user baseline (same trust model
//! as custom agent definitions, which already allow spawning arbitrary
//! executables).

use serde::Serialize;
use std::path::Path;
use tokio::process::Command;

use crate::domain::{DomainError, Result};
use crate::git::validate_path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

pub async fn run(worktree_path: &Path, script: &str) -> Result<ScriptOutput> {
    validate_path(worktree_path)?;
    if script.trim().is_empty() {
        return Err(DomainError::Invalid("script is empty".into()));
    }
    let output = Command::new("sh")
        .arg("-c")
        .arg(script)
        .current_dir(worktree_path)
        .output()
        .await
        .map_err(DomainError::Io)?;

    Ok(ScriptOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}
