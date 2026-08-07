CREATE TYPE stage AS ENUM (
    'prd', 'plan', 'review', 'approved', 'building',
    'simulating', 'testing', 'docs', 'deployed', 'failed'
);

CREATE TYPE agent_type AS ENUM ('claude', 'cursor');

CREATE TYPE run_status AS ENUM ('idle', 'running', 'success', 'failed', 'blocked');

CREATE TYPE doc_status AS ENUM ('draft', 'final');

CREATE TYPE plan_status AS ENUM ('draft', 'revised', 'approved');

CREATE TABLE cards (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    repo_path     TEXT NOT NULL,
    branch        TEXT NOT NULL,
    worktree_path TEXT,
    stage         stage NOT NULL DEFAULT 'prd',
    agent         agent_type NOT NULL DEFAULT 'claude',
    status        run_status NOT NULL DEFAULT 'idle',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE prds (
    id         TEXT PRIMARY KEY,
    card_id    TEXT NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    version    INT NOT NULL DEFAULT 1,
    status     doc_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plans (
    id           TEXT PRIMARY KEY,
    card_id      TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    version      INT NOT NULL DEFAULT 1,
    parent_id    TEXT REFERENCES plans(id),
    status       plan_status NOT NULL DEFAULT 'draft',
    approved_by  TEXT,
    approved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_plans_card_id ON plans(card_id);

CREATE TABLE tasks (
    id      TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    title   TEXT NOT NULL,
    "order" INT NOT NULL,
    status  run_status NOT NULL DEFAULT 'idle'
);

CREATE INDEX idx_tasks_plan_id ON tasks(plan_id);

CREATE TABLE runs (
    id          TEXT PRIMARY KEY,
    card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    task_id     TEXT REFERENCES tasks(id),
    stage       stage NOT NULL,
    agent       agent_type NOT NULL,
    cmd         TEXT NOT NULL,
    stdout      TEXT NOT NULL DEFAULT '',
    stderr      TEXT NOT NULL DEFAULT '',
    exit_code   INT,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX idx_runs_card_id ON runs(card_id);
CREATE INDEX idx_runs_task_id ON runs(task_id);

CREATE TABLE artifacts (
    id        TEXT PRIMARY KEY,
    run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    diff      TEXT NOT NULL
);

CREATE INDEX idx_artifacts_run_id ON artifacts(run_id);

CREATE TABLE test_results (
    id       TEXT PRIMARY KEY,
    run_id   TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    passed   BOOLEAN NOT NULL,
    summary  TEXT NOT NULL,
    coverage REAL
);

CREATE INDEX idx_test_results_run_id ON test_results(run_id);

CREATE TABLE doc_collections (
    id      TEXT PRIMARY KEY,
    card_id TEXT NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE
);

CREATE TABLE doc_entries (
    id            TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES doc_collections(id) ON DELETE CASCADE,
    method        TEXT NOT NULL,
    path          TEXT NOT NULL,
    req_schema    JSONB,
    res_schema    JSONB,
    example       JSONB
);

CREATE INDEX idx_doc_entries_collection_id ON doc_entries(collection_id);
