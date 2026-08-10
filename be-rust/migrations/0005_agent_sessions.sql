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

CREATE INDEX idx_agent_sessions_workspace_id ON agent_sessions(workspace_id);
CREATE INDEX idx_agent_sessions_worktree_id ON agent_sessions(worktree_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(status);

CREATE TABLE session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_events_session_id_created_at ON session_events(session_id, created_at);
