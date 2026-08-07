package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Plan struct {
	ID           string     `json:"id"`
	CardID       string     `json:"cardId"`
	Title        string     `json:"title"`
	Content      string     `json:"content"`
	Version      int        `json:"version"`
	ParentID     *string    `json:"parentId"`
	RootID       string     `json:"rootId"`
	Status       string     `json:"status"`
	ApprovedBy   *string    `json:"approvedBy"`
	ApprovedAt   *time.Time `json:"approvedAt"`
	SourceCardID *string    `json:"sourceCardId"`
	SourcePlanID *string    `json:"sourcePlanId"`
	CreatedAt    time.Time  `json:"createdAt"`
}

// PlanSummary is one row per draft lineage (its current/latest version) —
// used for the draft-picker list.
type PlanSummary struct {
	ID           string     `json:"id"`
	CardID       string     `json:"cardId"`
	Title        string     `json:"title"`
	Version      int        `json:"version"`
	RootID       string     `json:"rootId"`
	Status       string     `json:"status"`
	TaskCount    int        `json:"taskCount"`
	SourceCardID *string    `json:"sourceCardId"`
	SourcePlanID *string    `json:"sourcePlanId"`
	ApprovedAt   *time.Time `json:"approvedAt"`
}

type PlanStore struct {
	pool *pgxpool.Pool
}

func NewPlanStore(pool *pgxpool.Pool) *PlanStore {
	return &PlanStore{pool: pool}
}

// Create inserts a new plan version. For the first version of a new draft
// lineage, pass rootID equal to id itself and parentID nil; for a
// chat/regenerate-driven revision, pass the lineage's stable rootID and the
// previous leaf's id as parentID.
func (s *PlanStore) Create(ctx context.Context, id, cardID, title, content string, parentID *string, rootID string, version int) (*Plan, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO plans (id, card_id, title, content, version, parent_id, root_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, card_id, title, content, version, parent_id, root_id, status, approved_by, approved_at, source_card_id, source_plan_id, created_at
	`, id, cardID, title, content, version, parentID, rootID)
	return scanPlan(row)
}

func (s *PlanStore) GetLatestByRoot(ctx context.Context, cardID, rootID string) (*Plan, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, card_id, title, content, version, parent_id, root_id, status, approved_by, approved_at, source_card_id, source_plan_id, created_at
		FROM plans WHERE root_id = $1 AND card_id = $2 ORDER BY version DESC LIMIT 1
	`, rootID, cardID)
	return scanPlan(row)
}

func (s *PlanStore) ListByCard(ctx context.Context, cardID string) ([]*PlanSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (p.root_id)
			p.id, p.card_id, p.title, p.version, p.root_id, p.status, p.approved_at,
			p.source_card_id, p.source_plan_id,
			(SELECT count(*) FROM tasks t WHERE t.plan_id = p.id)
		FROM plans p
		WHERE p.card_id = $1
		ORDER BY p.root_id, p.version DESC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*PlanSummary{}
	for rows.Next() {
		var p PlanSummary
		if err := rows.Scan(&p.ID, &p.CardID, &p.Title, &p.Version, &p.RootID, &p.Status, &p.ApprovedAt,
			&p.SourceCardID, &p.SourcePlanID, &p.TaskCount); err != nil {
			return nil, err
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}

// RenameLineage retitles every version row in a draft lineage — title is
// stored per-row (simplest for reads) but always kept in sync across the
// whole lineage on rename.
func (s *PlanStore) RenameLineage(ctx context.Context, cardID, rootID, title string) error {
	_, err := s.pool.Exec(ctx, `UPDATE plans SET title = $3 WHERE root_id = $1 AND card_id = $2`, rootID, cardID, title)
	return err
}

func (s *PlanStore) Approve(ctx context.Context, id, approvedBy string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE plans SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1
	`, id, approvedBy)
	return err
}

// Delete removes an entire draft lineage (all versions), cascading to tasks
// via plan_id -> plans(id) ON DELETE CASCADE.
func (s *PlanStore) Delete(ctx context.Context, cardID, rootID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM plans WHERE root_id = $1 AND card_id = $2`, rootID, cardID)
	return err
}

// ImportFrom deep-copies another card's plan draft (its latest version's
// content, plus a fresh copy of its tasks reset to idle) as a brand-new
// lineage owned by targetCardID. newTaskID is called once per copied task
// to avoid this package depending on an id-generation library directly.
func (s *PlanStore) ImportFrom(
	ctx context.Context, tasks *TaskStore,
	newID, sourceCardID, sourceRootID, targetCardID, title string,
	newTaskID func() string,
) (*Plan, []*Task, error) {
	source, err := s.GetLatestByRoot(ctx, sourceCardID, sourceRootID)
	if err != nil {
		return nil, nil, err
	}
	sourceTasks, err := tasks.ListByPlan(ctx, source.ID)
	if err != nil {
		return nil, nil, err
	}

	row := s.pool.QueryRow(ctx, `
		INSERT INTO plans (id, card_id, title, content, version, parent_id, root_id, source_card_id, source_plan_id)
		VALUES ($1, $2, $3, $4, 1, NULL, $1, $5, $6)
		RETURNING id, card_id, title, content, version, parent_id, root_id, status, approved_by, approved_at, source_card_id, source_plan_id, created_at
	`, newID, targetCardID, title, source.Content, sourceCardID, source.ID)
	plan, err := scanPlan(row)
	if err != nil {
		return nil, nil, err
	}

	newTasks := make([]*Task, 0, len(sourceTasks))
	for _, t := range sourceTasks {
		nt, err := tasks.Create(ctx, newTaskID(), plan.ID, t.Title, t.Order)
		if err != nil {
			return nil, nil, err
		}
		newTasks = append(newTasks, nt)
	}
	return plan, newTasks, nil
}

func scanPlan(row rowScanner) (*Plan, error) {
	var p Plan
	err := row.Scan(&p.ID, &p.CardID, &p.Title, &p.Content, &p.Version, &p.ParentID, &p.RootID,
		&p.Status, &p.ApprovedBy, &p.ApprovedAt, &p.SourceCardID, &p.SourcePlanID, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}
