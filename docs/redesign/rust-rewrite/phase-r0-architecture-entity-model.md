# Phase R0 — Architecture & Entity Model

Goal: lock the schema/entity design before writing Rust code. This is a design
doc phase — output is a finalized schema + trait signatures, reviewed before R1 starts.

## Entity model (spec §6, adapted)

```
Workspace
 └── Repository (local_path, remote_url, default_branch)
       ├── Worktree (type: primary | task)
       │     └── AgentSession (0 or more, sequential or concurrent)
       │           └── SessionEvent (append-only log)
       └── Command (custom prompt templates, scope: global|workspace|repository)

AgentDefinition (provider catalog: claude, cursor, codex, gemini, opencode, custom)
```

Deviations from spec, documented with reason:
- **Postgres, not SQLite** (spec §31-32 assumes local-first SQLite). devpipe is
  a hosted web app with an existing Postgres instance (`be/internal/db`) —
  keep Postgres. `be-rust` already depends on `sqlx` postgres feature.
- **No OS Keychain** (spec §31, §47). Secrets (GitHub token, agent API keys if
  any) live in server-side env vars / secrets manager, never in the DB in
  plaintext, never returned to frontend. Document this per-secret when added.
- **`User` entity**: spec §6.1 makes it optional for local-first; devpipe is
  multi-session over HTTP but currently single-tenant (no auth system exists
  in `be/` today — confirm before assuming). If no auth exists, skip `User`
  table for R0-R7, add only if auth becomes a real requirement — don't build
  speculative multi-tenancy.

## Schema (Postgres DDL, target for R1 migrations)

```sql
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_opened_at TIMESTAMPTZ
);

CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    local_path TEXT NOT NULL,
    remote_url TEXT,
    default_branch TEXT NOT NULL DEFAULT 'main',
    setup_script TEXT,
    run_script TEXT,
    test_script TEXT,
    teardown_script TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE worktrees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    branch TEXT NOT NULL,
    target_branch TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('primary', 'task')),
    status TEXT NOT NULL CHECK (status IN ('clean','modified','conflicted','ahead','behind')),
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agent_definitions (
    id TEXT PRIMARY KEY,          -- 'claude', 'cursor', 'codex', 'custom:<name>'
    name TEXT NOT NULL,
    executable TEXT NOT NULL,
    default_args JSONB NOT NULL DEFAULT '[]',
    capabilities JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    worktree_id UUID REFERENCES worktrees(id) ON DELETE SET NULL,
    agent_definition_id TEXT NOT NULL REFERENCES agent_definitions(id),
    model TEXT,
    reasoning_level TEXT,
    status TEXT NOT NULL CHECK (status IN
      ('created','starting','running','needs_input','waiting','completed','failed','stopped')),
    process_id INTEGER,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    exit_code INTEGER
);

CREATE TABLE session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,     -- normalized AgentEvent variant, see phase-r4
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_events_session_id_created_at ON session_events(session_id, created_at);

CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope TEXT NOT NULL CHECK (scope IN ('global','workspace','repository')),
    scope_id UUID,                -- null for global
    name TEXT NOT NULL,           -- '/review'
    prompt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Not built in R0-R8 (explicitly out of scope, matches earlier gap-audit
reasoning — advanced/enterprise, revisit if requirements grow):
- `agent_teams` / `coordination_state` (spec §15-16)
- org/team policy tables (spec §49-51)
- task dependency graph (spec §55)

## Rust trait signatures (locked here, implemented in R3)

```rust
#[async_trait]
pub trait AgentAdapter: Send + Sync {
    fn id(&self) -> &str;
    async fn detect(&self) -> Result<bool>;
    async fn start(&self, cfg: StartConfig) -> Result<SessionHandle>;
}

pub trait SessionHandle: Send + Sync {
    fn id(&self) -> Uuid;
    async fn send(&self, input: &str) -> Result<()>;
    async fn stop(&self) -> Result<()>;
    fn events(&self) -> broadcast::Receiver<AgentEvent>;
}

pub trait WorktreeManager: Send + Sync {
    async fn create(&self, req: CreateWorktreeRequest) -> Result<Worktree>;
    async fn remove(&self, id: Uuid) -> Result<()>;
    async fn status(&self, id: Uuid) -> Result<WorktreeStatus>;
    async fn diff(&self, id: Uuid) -> Result<Diff>;
}
```

## Acceptance criteria
- Schema reviewed and approved (this doc) before any migration file is written.
- Every table has a documented reason to exist (no speculative columns).
- Trait signatures compile as a standalone crate stub (`cargo check` on an
  empty impl) before R1 begins real implementation.

## Open decisions to resolve before R1
- [ ] Git operations: `git2` crate (libgit2 bindings) vs shelling out to
      system `git` — resolved in phase-r2, not here, but note the choice
      affects whether `libgit2` becomes a `Cargo.toml` dependency in R0's
      final `Cargo.toml` draft.
- [ ] Auth: confirm `be/` (Go) has zero auth today (`grep -rn "auth\|jwt\|session" be/internal`) before finalizing "no User table" decision.
