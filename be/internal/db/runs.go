package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Run struct {
	ID         string     `json:"id"`
	CardID     string     `json:"cardId"`
	TaskID     *string    `json:"taskId"`
	Stage      string     `json:"stage"`
	Agent      string     `json:"agent"`
	Cmd        string     `json:"cmd"`
	Stdout     string     `json:"stdout"`
	Stderr     string     `json:"stderr"`
	ExitCode   *int       `json:"exitCode"`
	StartedAt  time.Time  `json:"startedAt"`
	FinishedAt *time.Time `json:"finishedAt"`
}

type RunStore struct {
	pool *pgxpool.Pool
}

func NewRunStore(pool *pgxpool.Pool) *RunStore {
	return &RunStore{pool: pool}
}

func (s *RunStore) Create(ctx context.Context, id, cardID string, taskID *string, stage, agent, cmd string) (*Run, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO runs (id, card_id, task_id, stage, agent, cmd)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, card_id, task_id, stage, agent, cmd, stdout, stderr, exit_code, started_at, finished_at
	`, id, cardID, taskID, stage, agent, cmd)
	return scanRun(row)
}

func (s *RunStore) SetOutput(ctx context.Context, id, output string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE runs SET stdout = $2 WHERE id = $1
	`, id, output)
	return err
}

func (s *RunStore) Finish(ctx context.Context, id string, exitCode int) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE runs SET exit_code = $2, finished_at = now() WHERE id = $1
	`, id, exitCode)
	return err
}

func (s *RunStore) ListByCard(ctx context.Context, cardID string) ([]*Run, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, card_id, task_id, stage, agent, cmd, stdout, stderr, exit_code, started_at, finished_at
		FROM runs WHERE card_id = $1 ORDER BY started_at ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := []*Run{}
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, r)
	}
	return runs, rows.Err()
}

type RunWithCard struct {
	Run
	CardTitle string `json:"cardTitle"`
}

func (s *RunStore) ListRecent(ctx context.Context, limit int) ([]*RunWithCard, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.card_id, r.task_id, r.stage, r.agent, r.cmd, r.stdout, r.stderr, r.exit_code, r.started_at, r.finished_at, c.title
		FROM runs r
		JOIN cards c ON c.id = r.card_id
		ORDER BY r.started_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := []*RunWithCard{}
	for rows.Next() {
		var r RunWithCard
		err := rows.Scan(&r.ID, &r.CardID, &r.TaskID, &r.Stage, &r.Agent, &r.Cmd,
			&r.Stdout, &r.Stderr, &r.ExitCode, &r.StartedAt, &r.FinishedAt, &r.CardTitle)
		if err != nil {
			return nil, err
		}
		runs = append(runs, &r)
	}
	return runs, rows.Err()
}

func (s *RunStore) ListByCardStage(ctx context.Context, cardID, stage string) ([]*Run, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, card_id, task_id, stage, agent, cmd, stdout, stderr, exit_code, started_at, finished_at
		FROM runs WHERE card_id = $1 AND stage = $2 ORDER BY started_at ASC
	`, cardID, stage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	runs := []*Run{}
	for rows.Next() {
		r, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, r)
	}
	return runs, rows.Err()
}

func scanRun(row rowScanner) (*Run, error) {
	var r Run
	err := row.Scan(&r.ID, &r.CardID, &r.TaskID, &r.Stage, &r.Agent, &r.Cmd,
		&r.Stdout, &r.Stderr, &r.ExitCode, &r.StartedAt, &r.FinishedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}
