CREATE TABLE agent_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    executable TEXT NOT NULL,
    default_args JSONB NOT NULL DEFAULT '[]',
    capabilities JSONB NOT NULL DEFAULT '{}'
);

INSERT INTO agent_definitions (id, name, executable, default_args, capabilities) VALUES
    ('claude', 'Claude Code', 'claude', '[]', '{}'),
    ('cursor', 'Cursor', 'cursor-agent', '[]', '{}');
