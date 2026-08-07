package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Task struct {
	ID     string `json:"id"`
	PlanID string `json:"planId"`
	Title  string `json:"title"`
	Order  int    `json:"order"`
	Status string `json:"status"`
}

type TaskStore struct {
	pool *pgxpool.Pool
}

func NewTaskStore(pool *pgxpool.Pool) *TaskStore {
	return &TaskStore{pool: pool}
}

func (s *TaskStore) Create(ctx context.Context, id, planID, title string, order int) (*Task, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO tasks (id, plan_id, title, "order")
		VALUES ($1, $2, $3, $4)
		RETURNING id, plan_id, title, "order", status
	`, id, planID, title, order)
	return scanTask(row)
}

func (s *TaskStore) ListByPlan(ctx context.Context, planID string) ([]*Task, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, plan_id, title, "order", status
		FROM tasks WHERE plan_id = $1 ORDER BY "order" ASC
	`, planID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := []*Task{}
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// BelongsToLineage verifies a task's plan actually belongs to the given
// card and plan lineage (root) before a handler mutates it — task ids alone
// aren't scoped to any card/plan, so without this check a task from one
// card's plan could be renamed/reordered/deleted via any other card's URL.
func (s *TaskStore) BelongsToLineage(ctx context.Context, taskID, cardID, rootID string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM tasks t
			JOIN plans p ON p.id = t.plan_id
			WHERE t.id = $1 AND p.card_id = $2 AND p.root_id = $3
		)
	`, taskID, cardID, rootID).Scan(&ok)
	return ok, err
}

func (s *TaskStore) UpdateTitle(ctx context.Context, id, title string) error {
	_, err := s.pool.Exec(ctx, `UPDATE tasks SET title = $2 WHERE id = $1`, id, title)
	return err
}

func (s *TaskStore) UpdateOrder(ctx context.Context, id string, order int) error {
	_, err := s.pool.Exec(ctx, `UPDATE tasks SET "order" = $2 WHERE id = $1`, id, order)
	return err
}

func (s *TaskStore) UpdateStatus(ctx context.Context, id, status string) error {
	_, err := s.pool.Exec(ctx, `UPDATE tasks SET status = $2 WHERE id = $1`, id, status)
	return err
}

func (s *TaskStore) Delete(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	return err
}

func scanTask(row rowScanner) (*Task, error) {
	var t Task
	if err := row.Scan(&t.ID, &t.PlanID, &t.Title, &t.Order, &t.Status); err != nil {
		return nil, err
	}
	return &t, nil
}
