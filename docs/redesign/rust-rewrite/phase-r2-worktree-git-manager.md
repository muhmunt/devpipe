# Phase R2 — Worktree & Git Manager (spec §7)

Goal: implement the `WorktreeManager` trait from R0 for real — the core
isolation primitive ("one task = one isolated filesystem + one branch").

## Decision: `git2` (libgit2 bindings) vs shelling out
Recommendation: **shell out to system `git`** for worktree add/remove/status,
**`git2` crate** for diff generation (needs structured hunk data, not just text).
Reasoning:
- `git worktree add/remove` has no clean libgit2 equivalent for the exact
  worktree-metadata behavior git CLI maintains (`.git/worktrees/<name>`) —
  shelling out matches spec's own example (`git worktree add ../project-task-auth -b feature/auth`)
  and avoids reimplementing worktree bookkeeping.
- Diff (`git2::Repository::diff_...`) is cleaner as structured data than
  parsing `git diff` text output for the file-list + hunk view phase-r5 needs.
- Both approaches coexist fine; don't force one library for everything.

## Tasks

### 2.1 — `git` module (`be-rust/git/` or `be-rust/src/git.rs` per R1's layout call)
```rust
pub async fn worktree_add(repo_path: &Path, worktree_path: &Path, branch: &str, target: &str) -> Result<()>;
pub async fn worktree_remove(repo_path: &Path, worktree_path: &Path) -> Result<()>;
pub async fn status(worktree_path: &Path) -> Result<WorktreeStatusInfo>; // clean/modified/conflicted/ahead/behind
pub fn diff(worktree_path: &Path, target_branch: &str) -> Result<Diff>;  // git2, sync (libgit2 isn't async)
```
- Shell commands run via `tokio::process::Command`, never with unsanitized
  user input interpolated into the command string — branch names/paths are
  validated (alphanumeric + `-_/.` only) before use, closing the same
  shell-injection concern flagged in the earlier Go-plan's security phase.

### 2.2 — `WorktreeManager` impl
- Wires `git` module functions into the trait from R0, persists `Worktree`
  rows in Postgres (status kept in sync — recompute on read, not cached
  indefinitely, since git state changes outside the API too, e.g. user edits
  files directly).
- `create()`: validates repository exists, target branch exists, worktree
  path doesn't collide, then `git worktree add`.
- `remove()`: `git worktree remove` (or `--force` only if explicitly
  requested by caller — never force-delete uncommitted work silently).

### 2.3 — Conflict handling (spec §7 "Conflict scenario")
- `status()` surfaces `conflicted` accurately (check `.git/MERGE_HEAD` or
  `git status --porcelain` conflict markers) — the API does **not** attempt
  automatic conflict resolution, matching spec's explicit guidance ("should
  NOT pretend conflicts do not exist").

### 2.4 — Wire into R1's stubbed endpoint
- `POST /api/repositories/:id/worktrees` now calls the real `WorktreeManager`
  instead of returning 501.
- `GET /api/worktrees/:id/diff` (new route) returns R0's `Diff` DTO.

## Acceptance criteria
- Creating a worktree via the API produces a real `git worktree list` entry
  on disk, removing it cleans that entry up.
- `status()` correctly reports all 5 states against real repo fixtures
  (clean, modified, ahead, behind, conflicted — conflicted via a deliberate
  merge-conflict test fixture).
- Diff endpoint returns correct file list + hunks for a repo with real changes.

## Manual test checklist
- [ ] Create worktree, `git worktree list` on host shows it, `git status` inside matches API's reported status.
- [ ] Attempt to create a worktree at a colliding path — API returns 409, doesn't corrupt existing worktree.
- [ ] Force a merge conflict fixture, confirm `status()` reports `conflicted`.
- [ ] Attempt path traversal (`../../etc`) as a worktree path param — rejected before reaching `git`.
