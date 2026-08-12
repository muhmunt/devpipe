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
    exec(worktree_path, script, None).await
}

/// Runs one command inside a worktree, optionally in a subdirectory of it.
///
/// This backs the terminal tab. Each call is its own `sh -c` — there is no
/// persistent shell, so shell state (exported variables, an activated
/// virtualenv) does not survive between commands; the caller tracks the
/// working directory itself and passes it back as `relative_cwd`. The
/// terminal UI says so rather than letting people discover it by having
/// `export` silently do nothing.
///
/// `relative_cwd` is confined to the worktree: an absolute path or a `..`
/// escape is refused, so the terminal can't be walked out of the worktree it
/// belongs to. That is a containment boundary for *navigation*, not for
/// execution — the command itself is an unsandboxed shell, same trust model
/// as the repository's configured scripts and custom agent definitions.
pub async fn exec(worktree_path: &Path, command: &str, relative_cwd: Option<&str>) -> Result<ScriptOutput> {
    validate_path(worktree_path)?;
    if command.trim().is_empty() {
        return Err(DomainError::Invalid("command is empty".into()));
    }

    let mut cwd = worktree_path.to_path_buf();
    if let Some(relative) = relative_cwd.filter(|r| !r.is_empty() && *r != ".") {
        if relative.starts_with('/') || relative.split('/').any(|segment| segment == "..") {
            return Err(DomainError::Invalid(format!("working directory must be inside the worktree: {relative}")));
        }
        cwd = cwd.join(relative);
        if !cwd.is_dir() {
            return Err(DomainError::Invalid(format!("no such directory: {relative}")));
        }
    }

    let output = Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(&cwd)
        .output()
        .await
        .map_err(DomainError::Io)?;

    Ok(ScriptOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}
