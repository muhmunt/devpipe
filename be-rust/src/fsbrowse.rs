//! Server-side directory browsing, so the UI can offer a real folder picker.
//!
//! A browser cannot report the absolute path of a folder the user selects
//! (`webkitdirectory` yields only a relative path; the File System Access API
//! yields a handle with no path at all). devpipe's backend needs a real path
//! to run git, so the picker has to browse from this side.
//!
//! Scope is deliberately narrow: directory names only, never file contents,
//! and never anything the existing path validation would reject.

use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::domain::{DomainError, Result};
use crate::git::{is_git_repo, validate_path};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_git_repo: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseResult {
    pub path: String,
    pub parent: Option<String>,
    /// Whether the directory being shown is itself a git repository, so the
    /// picker can enable or disable "Open" instead of letting the user submit
    /// a folder the backend will reject.
    pub is_git_repo: bool,
    pub entries: Vec<DirEntryInfo>,
}

pub fn home_dir() -> PathBuf {
    std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/"))
}

pub async fn browse(path: Option<&str>) -> Result<BrowseResult> {
    let target = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => home_dir(),
    };
    validate_path(&target)?;

    if !target.is_dir() {
        return Err(DomainError::Invalid(format!("not a directory: {}", target.display())));
    }

    let mut read_dir = tokio::fs::read_dir(&target).await.map_err(DomainError::Io)?;
    let mut dirs: Vec<PathBuf> = Vec::new();
    while let Some(entry) = read_dir.next_entry().await.map_err(DomainError::Io)? {
        let p = entry.path();
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else { continue };
        // Hidden directories are noise in a project picker, and `.git` in
        // particular would be actively misleading.
        if name.starts_with('.') {
            continue;
        }
        if entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false) {
            dirs.push(p);
        }
    }
    dirs.sort();

    // is_git_repo shells out per candidate, so run them concurrently rather
    // than serially down a directory with many children.
    let flags = futures::future::join_all(dirs.iter().map(|p| is_git_repo(p))).await;

    let entries = dirs
        .into_iter()
        .zip(flags)
        .filter_map(|(p, is_repo)| {
            Some(DirEntryInfo {
                name: p.file_name()?.to_str()?.to_string(),
                path: p.to_str()?.to_string(),
                is_git_repo: is_repo,
            })
        })
        .collect();

    Ok(BrowseResult {
        is_git_repo: is_git_repo(&target).await,
        path: target.to_string_lossy().to_string(),
        parent: target.parent().and_then(Path::to_str).map(str::to_string),
        entries,
    })
}
