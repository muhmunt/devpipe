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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (repository_id, path)
);

CREATE INDEX idx_worktrees_repository_id ON worktrees(repository_id);
