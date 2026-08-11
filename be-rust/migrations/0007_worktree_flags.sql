-- Pin and favorite are kept as separate flags: pinned worktrees sort to the
-- top of their repository group, favorites are marked and filterable. They
-- answer different questions, so one boolean cannot serve both.
ALTER TABLE worktrees ADD COLUMN pinned_at TIMESTAMPTZ;
ALTER TABLE worktrees ADD COLUMN favorite BOOLEAN NOT NULL DEFAULT false;
