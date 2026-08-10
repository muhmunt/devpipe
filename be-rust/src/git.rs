//! Shell-based git operations (Rung 3 / phase-r2). Every argument that ends
//! up on a command line is validated first — no raw user input is ever
//! interpolated into a shell string, and inputs are passed as separate
//! process arguments (never a single joined command string).

use std::path::Path;
use tokio::process::Command;

use crate::domain::{Diff, DiffFile, DomainError, Result, WorktreeStatus};

/// Branch/ref names: conservative allowlist, no leading `-` (flag injection),
/// no `..` (path traversal via ref syntax).
pub fn validate_branch_name(name: &str) -> Result<()> {
    if name.is_empty() || name.starts_with('-') || name.contains("..") {
        return Err(DomainError::Invalid(format!("invalid branch name: {name}")));
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '/' | '.')) {
        return Err(DomainError::Invalid(format!("invalid branch name: {name}")));
    }
    Ok(())
}

/// Filesystem paths: must be absolute, no `..` components.
pub fn validate_path(path: &Path) -> Result<()> {
    if !path.is_absolute() {
        return Err(DomainError::Invalid(format!("path must be absolute: {}", path.display())));
    }
    if path.components().any(|c| c.as_os_str() == "..") {
        return Err(DomainError::Invalid(format!("path traversal rejected: {}", path.display())));
    }
    Ok(())
}

async fn run_git(cwd: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(args)
        .output()
        .await
        .map_err(DomainError::Io)?;

    if !output.status.success() {
        return Err(DomainError::Invalid(format!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub async fn worktree_add(repo_path: &Path, worktree_path: &Path, branch: &str, target_branch: &str) -> Result<()> {
    validate_path(repo_path)?;
    validate_path(worktree_path)?;
    validate_branch_name(branch)?;
    validate_branch_name(target_branch)?;
    if worktree_path.exists() {
        return Err(DomainError::Conflict(format!(
            "worktree path already exists: {}",
            worktree_path.display()
        )));
    }

    run_git(
        repo_path,
        &[
            "worktree",
            "add",
            "-b",
            branch,
            worktree_path.to_str().ok_or_else(|| DomainError::Invalid("non-utf8 path".into()))?,
            target_branch,
        ],
    )
    .await?;
    Ok(())
}

pub async fn worktree_remove(repo_path: &Path, worktree_path: &Path) -> Result<()> {
    validate_path(repo_path)?;
    validate_path(worktree_path)?;
    run_git(
        repo_path,
        &["worktree", "remove", worktree_path.to_str().ok_or_else(|| DomainError::Invalid("non-utf8 path".into()))?],
    )
    .await?;
    Ok(())
}

/// Recomputes status against `target_branch`. Conflict detection checks for
/// unmerged paths in porcelain output; ahead/behind is only computed if
/// `target_branch` is reachable locally — falls back to clean/modified
/// otherwise rather than failing the whole status check.
pub async fn status(worktree_path: &Path, target_branch: &str) -> Result<WorktreeStatus> {
    validate_path(worktree_path)?;
    let porcelain = run_git(worktree_path, &["status", "--porcelain=v1"]).await?;

    if porcelain.lines().any(|l| l.starts_with("UU") || l.starts_with("AA") || l.starts_with("DD")) {
        return Ok(WorktreeStatus::Conflicted);
    }
    if !porcelain.trim().is_empty() {
        return Ok(WorktreeStatus::Modified);
    }

    if validate_branch_name(target_branch).is_ok() {
        if let Ok(counts) = run_git(worktree_path, &["rev-list", "--left-right", "--count", &format!("HEAD...{target_branch}")]).await {
            let parts: Vec<&str> = counts.split_whitespace().collect();
            if let [ahead, behind] = parts[..] {
                let ahead: i64 = ahead.parse().unwrap_or(0);
                let behind: i64 = behind.parse().unwrap_or(0);
                if ahead > 0 && behind == 0 {
                    return Ok(WorktreeStatus::Ahead);
                }
                if behind > 0 && ahead == 0 {
                    return Ok(WorktreeStatus::Behind);
                }
            }
        }
    }
    Ok(WorktreeStatus::Clean)
}

pub async fn diff(worktree_path: &Path, target_branch: &str) -> Result<Diff> {
    validate_path(worktree_path)?;
    validate_branch_name(target_branch)?;

    let range = format!("{target_branch}...HEAD");
    let name_status = run_git(worktree_path, &["diff", "--name-status", &range]).await?;
    let numstat = run_git(worktree_path, &["diff", "--numstat", &range]).await?;
    let full_diff = run_git(worktree_path, &["diff", &range]).await?;

    let mut status_by_path = std::collections::HashMap::new();
    for line in name_status.lines() {
        let mut parts = line.splitn(2, '\t');
        if let (Some(status), Some(path)) = (parts.next(), parts.next()) {
            let human = match status.chars().next() {
                Some('A') => "added",
                Some('D') => "deleted",
                Some('R') => "renamed",
                _ => "modified",
            };
            status_by_path.insert(path.to_string(), human.to_string());
        }
    }

    let mut files = Vec::new();
    for line in numstat.lines() {
        let mut parts = line.splitn(3, '\t');
        if let (Some(add), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next()) {
            files.push(DiffFile {
                path: path.to_string(),
                additions: add.parse().unwrap_or(0),
                deletions: del.parse().unwrap_or(0),
                status: status_by_path.get(path).cloned().unwrap_or_else(|| "modified".to_string()),
            });
        }
    }

    Ok(Diff { files, diff: full_diff })
}
