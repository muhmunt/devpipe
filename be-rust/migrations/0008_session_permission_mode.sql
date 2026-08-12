-- A chat is launched with a permission mode that decides whether the agent
-- may edit files or run commands. It was only ever held in memory, so a
-- conversation resumed after a restart would silently come back with
-- different permissions than it started with.
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS permission_mode TEXT;
