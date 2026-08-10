//! Shell-based git operations (Rung 3 / phase-r2). Every argument that ends
//! up on a command line is validated first — no raw user input is ever
//! interpolated into a shell string, and inputs are passed as separate
//! process arguments (never a single joined command string).

use std::path::Path;
use tokio::process::Command;

use crate::domain::{Commit, Diff, DiffFile, DomainError, Result, WorktreeStatus};

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

/// `git clone <url> <dest>`. No leading-dash / no shell string — same argv
/// safety pattern as everything else in this module. Runs without `-C`
/// since the destination doesn't exist yet.
pub async fn clone(url: &str, dest: &Path) -> Result<()> {
    validate_path(dest)?;
    if url.is_empty() || url.starts_with('-') {
        return Err(DomainError::Invalid(format!("invalid clone url: {url}")));
    }
    if dest.exists() {
        return Err(DomainError::Conflict(format!("destination already exists: {}", dest.display())));
    }
    let dest_str = dest.to_str().ok_or_else(|| DomainError::Invalid("non-utf8 path".into()))?;
    let output = Command::new("git")
        .args(["clone", url, dest_str])
        .output()
        .await
        .map_err(DomainError::Io)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.trim().is_empty() { stderr.trim() } else { stdout.trim() };
        return Err(DomainError::Invalid(format!("git clone failed: {detail}")));
    }
    Ok(())
}

/// Used by the "Open Folder" flow — fail fast with a clear error at
/// creation time instead of a confusing failure the first time some other
/// git operation runs against a non-repo path.
pub async fn is_git_repo(path: &Path) -> bool {
    Command::new("git")
        .arg("-C")
        .arg(path)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
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
        // Some git subcommands (e.g. `commit` with nothing staged) report
        // the actual reason on stdout, not stderr — include both so the
        // error is never silently empty.
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.trim().is_empty() { stderr.trim() } else { stdout.trim() };
        return Err(DomainError::Invalid(format!("git {} failed: {}", args.join(" "), detail)));
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

/// `git add -A && git commit -m <message>`. `message` is passed as its own
/// argv entry (never shell-interpolated), so it's safe regardless of
/// content — including a leading `-`, which argv parsing (not shell
/// parsing) still binds to `-m`'s value.
pub async fn commit(worktree_path: &Path, message: &str) -> Result<()> {
    validate_path(worktree_path)?;
    if message.trim().is_empty() {
        return Err(DomainError::Invalid("commit message must not be empty".into()));
    }
    run_git(worktree_path, &["add", "-A"]).await?;
    run_git(worktree_path, &["commit", "-m", message]).await?;
    Ok(())
}

/// `git push -u origin <branch>`. No remote configured or no push access
/// surfaces as a real git error (via run_git's stderr propagation) — not
/// silently swallowed.
pub async fn push(worktree_path: &Path, branch: &str) -> Result<()> {
    validate_path(worktree_path)?;
    validate_branch_name(branch)?;
    run_git(worktree_path, &["push", "-u", "origin", branch]).await?;
    Ok(())
}

/// Cheap `+N -M` summary for a worktree against its target branch, for the
/// sidebar. Uses `--shortstat` rather than a full diff: measured at ~117ms
/// on a 146-file change, so it is viable to run one per worktree
/// concurrently on a list request. Returns (0, 0) rather than erroring when
/// the target branch is unknown, so one odd worktree can't fail the list.
pub async fn diff_stat(worktree_path: &Path, target_branch: &str) -> (u32, u32) {
    if validate_path(worktree_path).is_err() || validate_branch_name(target_branch).is_err() {
        return (0, 0);
    }
    let range = format!("{target_branch}...HEAD");
    let Ok(out) = run_git(worktree_path, &["diff", "--shortstat", &range]).await else {
        return (0, 0);
    };
    // Example: " 12 files changed, 340 insertions(+), 12 deletions(-)"
    let mut additions = 0;
    let mut deletions = 0;
    for part in out.split(',') {
        let part = part.trim();
        let Some((count, _)) = part.split_once(' ') else { continue };
        let Ok(n) = count.parse::<u32>() else { continue };
        if part.contains("insertion") {
            additions = n;
        } else if part.contains("deletion") {
            deletions = n;
        }
    }
    (additions, deletions)
}

/// Tracked files + untracked-but-not-ignored files — i.e. exactly what a
/// developer would see as "real" files in the worktree, `.gitignore`
/// respected automatically, without walking heavy ignored directories
/// (node_modules, target, ...) the way a raw filesystem walk would.
/// Recent commit history for the worktree's current branch. Uses a `\x1f`
/// (unit separator) field delimiter — never appears in real commit
/// metadata — so multi-line commit messages can't corrupt the parse.
pub async fn commits(worktree_path: &Path, limit: u32) -> Result<Vec<Commit>> {
    validate_path(worktree_path)?;
    let limit_arg = format!("-{limit}");
    let format_arg = "--pretty=format:%H%x1f%an%x1f%ad%x1f%s".to_string();
    let output = run_git(worktree_path, &["log", &limit_arg, &format_arg, "--date=short"]).await.unwrap_or_default();
    Ok(output
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(4, '\u{1f}');
            Some(Commit {
                hash: parts.next()?.chars().take(8).collect(),
                author: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
                message: parts.next().unwrap_or("").to_string(),
            })
        })
        .collect())
}

pub async fn list_files(worktree_path: &Path) -> Result<Vec<String>> {
    validate_path(worktree_path)?;
    let tracked = run_git(worktree_path, &["ls-files"]).await?;
    let untracked = run_git(worktree_path, &["ls-files", "--others", "--exclude-standard"]).await?;
    let mut paths: Vec<String> = tracked.lines().chain(untracked.lines()).map(str::to_string).collect();
    paths.sort();
    paths.dedup();
    Ok(paths)
}
