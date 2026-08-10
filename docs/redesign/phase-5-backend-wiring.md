# Phase 5 — Backend Wiring / API Contract Gaps

Goal: close the gaps Phase 2-3 UI work exposed. Audited 2026-08-10 against
`be/cmd/api/main.go` (Go, chi router, primary backend — `be-rust` is a
separate Phase-0 axum experiment per recent commits, not yet the served API).

## Current confirmed routes (handlers registered in `main.go`)
- `CardHandler` (cards)
- `AgentHandler` (agent availability/detect)
- `PRDHandler` (prds)
- `PlanHandler` (plans)
- `BuildHandler` (build/tasks/runs/artifacts/chat via hub)
- `StreamHandler` (SSE via `stream.Hub`)
- `ChatHandler` (chat)
- `RunHandler` (runs/artifacts)
- `PathHandler` (paths)

No handler for: **git diff**, **git action state** (dirty/committed/pushed/PR/merge),
**CI checks**, **agent cost/token metrics**, **current-tool/current-file**.

## Tasks

### 5.1 — Diff endpoint (blocks Phase 2.4 DiffView)
- New `be/internal/handlers/diff.go` + `DiffHandler`.
- `GET /api/cards/:id/diff` → file list + unified diff content for
  `card.worktreePath` vs `card.branch`'s merge-base with target branch.
- Likely needs a `be/internal/git` package (shell out to `git diff` or use
  `go-git`) — check if one already exists before adding a new git dependency;
  `be-rust` mentions `libgit2`/git ops (`sc_git` in the reference doc is from
  the *unrelated* super.engineering spec, not this repo — don't conflate).
- Response shape (minimal, matches DiffView needs):
```json
{
  "files": [{"path": "src/x.go", "additions": 12, "deletions": 3, "status": "modified"}],
  "diff": "diff --git a/... unified diff text ..."
}
```

### 5.2 — Git action state endpoint (blocks Phase 2.5 git action bar)
- `GET /api/cards/:id/git-status` → `{"dirty": bool, "ahead": int, "behind": int, "pushed": bool, "prUrl": string|null}`.
- `POST /api/cards/:id/git-action` → body `{"action": "commit"|"push"|"create-pr"}`,
  executes the corresponding git/GitHub CLI operation server-side against the
  card's worktree. Requires GitHub token handling — confirm existing auth
  pattern in `be/internal` before adding a new credential path (check for
  existing `.env`/keychain-equivalent handling — this is a web backend so no
  macOS Keychain; use server-side secret env var, never send token to frontend).

### 5.3 — Checks endpoint (blocks Phase 3.3 Checks tab)
- Only build if there's a real CI integration target (GitHub Actions via
  GitHub API, keyed off `card.branch`). If no CI integration exists yet,
  **do not build this endpoint** — Phase 3.3 already specifies omitting the
  Checks tab UI in that case. Revisit when/if CI integration becomes a
  requirement; don't speculatively build.

### 5.4 — Agent metadata fields (blocks Phase 3.1 richer status row)
- Extend `Card` (Go struct in `be/internal/db/cards.go` + `lib/types.ts` `Card`)
  with optional fields as they become available from the agent runner:
  `currentTool string|null`, `currentFile string|null`. Do NOT add
  `tokens`/`cost` unless the agent adapter (`be/internal/agent`) actually
  captures usage data from Claude/Cursor CLI output — check `adapter.go`/
  `detect.go` for whether this is already parsed anywhere before adding
  unused columns.
- Any new `Card` field requires a DB migration (check `be/internal/db/db.go`
  migration mechanism) — additive/nullable only, no breaking changes to
  existing rows.

### 5.5 — Frontend `lib/api.ts` + `lib/types.ts` updates
- Add typed client methods matching whichever of 5.1/5.2/5.4 actually ship:
  `getCardDiff(id)`, `getCardGitStatus(id)`, `postCardGitAction(id, action)`.
- Extend `Card` type in `lib/types.ts` to match Go struct changes exactly —
  keep field names in sync (camelCase JS ↔ Go JSON tags), add a quick
  contract test if one pattern already exists in the repo, otherwise skip
  (don't introduce a new test framework just for this).

## Acceptance criteria
- Every button/tab shipped in Phase 2-3 that claimed "needs backend" now has
  either a real working endpoint or is explicitly removed from the UI (no
  dead/disabled-forever controls).
- New endpoints covered by at least one handler-level test following existing
  test patterns in `be/internal/*_test.go` (e.g. `worktree_test.go`).
- No secrets (GitHub tokens) ever returned in API responses to frontend.

## Manual test checklist
- [ ] `GET /api/cards/:id/diff` against a real card with uncommitted changes returns correct file list.
- [ ] Git action bar commit→push→PR flow works end-to-end on a scratch branch.
- [ ] Frontend `Card` type changes don't break existing Board/CardDetail rendering for cards missing the new optional fields (nullability handled).
