package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PRD struct {
	ID           string    `json:"id"`
	CardID       string    `json:"cardId"`
	Title        string    `json:"title"`
	Content      string    `json:"content"`
	Diagram      *string   `json:"diagram"`
	Version      int       `json:"version"`
	Status       string    `json:"status"`
	SourceCardID *string   `json:"sourceCardId"`
	SourcePRDID  *string   `json:"sourcePrdId"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// PRDSummary is the lightweight shape used for the draft-picker list — no
// content/diagram, so listing a card's drafts doesn't ship N full documents.
type PRDSummary struct {
	ID           string    `json:"id"`
	CardID       string    `json:"cardId"`
	Title        string    `json:"title"`
	Version      int       `json:"version"`
	Status       string    `json:"status"`
	SourceCardID *string   `json:"sourceCardId"`
	SourcePRDID  *string   `json:"sourcePrdId"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type PRDStore struct {
	pool *pgxpool.Pool
}

func NewPRDStore(pool *pgxpool.Pool) *PRDStore {
	return &PRDStore{pool: pool}
}

func (s *PRDStore) Create(ctx context.Context, id, cardID, title string) (*PRD, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO prds (id, card_id, title, content)
		VALUES ($1, $2, $3, '')
		RETURNING id, card_id, title, content, diagram, version, status, source_card_id, source_prd_id, created_at, updated_at
	`, id, cardID, title)
	return scanPRD(row)
}

func (s *PRDStore) ListByCard(ctx context.Context, cardID string) ([]*PRDSummary, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, card_id, title, version, status, source_card_id, source_prd_id, updated_at
		FROM prds WHERE card_id = $1 ORDER BY created_at ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []*PRDSummary{}
	for rows.Next() {
		var p PRDSummary
		if err := rows.Scan(&p.ID, &p.CardID, &p.Title, &p.Version, &p.Status, &p.SourceCardID, &p.SourcePRDID, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, &p)
	}
	return out, rows.Err()
}

// GetByID scopes by cardID too — a mismatched cardID returns pgx.ErrNoRows,
// the same as a missing row, so callers can't fetch another card's draft by
// guessing an id.
func (s *PRDStore) GetByID(ctx context.Context, cardID, prdID string) (*PRD, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, card_id, title, content, diagram, version, status, source_card_id, source_prd_id, created_at, updated_at
		FROM prds WHERE id = $1 AND card_id = $2
	`, prdID, cardID)
	return scanPRD(row)
}

func (s *PRDStore) Update(ctx context.Context, cardID, prdID, title, content string) (*PRD, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE prds SET title = $3, content = $4, version = version + 1, updated_at = now()
		WHERE id = $1 AND card_id = $2
		RETURNING id, card_id, title, content, diagram, version, status, source_card_id, source_prd_id, created_at, updated_at
	`, prdID, cardID, title, content)
	return scanPRD(row)
}

// UpdateContent saves content only, preserving the existing title — used by
// chat-driven autosave, which doesn't know or want to change the title.
func (s *PRDStore) UpdateContent(ctx context.Context, cardID, prdID, content string) (*PRD, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE prds SET content = $3, version = version + 1, updated_at = now()
		WHERE id = $1 AND card_id = $2
		RETURNING id, card_id, title, content, diagram, version, status, source_card_id, source_prd_id, created_at, updated_at
	`, prdID, cardID, content)
	return scanPRD(row)
}

func (s *PRDStore) Delete(ctx context.Context, cardID, prdID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM prds WHERE id = $1 AND card_id = $2`, prdID, cardID)
	return err
}

func (s *PRDStore) SetDiagram(ctx context.Context, cardID, prdID, diagram string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE prds SET diagram = $3, updated_at = now() WHERE id = $1 AND card_id = $2
	`, prdID, cardID, diagram)
	return err
}

// ImportFrom deep-copies a PRD from another card as a new draft — new id,
// content+diagram copied, status reset to 'draft', provenance recorded, no
// chat history carried over.
func (s *PRDStore) ImportFrom(ctx context.Context, newID, sourceCardID, sourcePRDID, targetCardID, title string) (*PRD, error) {
	source, err := s.GetByID(ctx, sourceCardID, sourcePRDID)
	if err != nil {
		return nil, err
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO prds (id, card_id, title, content, diagram, source_card_id, source_prd_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, card_id, title, content, diagram, version, status, source_card_id, source_prd_id, created_at, updated_at
	`, newID, targetCardID, title, source.Content, source.Diagram, sourceCardID, sourcePRDID)
	return scanPRD(row)
}

func scanPRD(row rowScanner) (*PRD, error) {
	var p PRD
	err := row.Scan(&p.ID, &p.CardID, &p.Title, &p.Content, &p.Diagram, &p.Version, &p.Status,
		&p.SourceCardID, &p.SourcePRDID, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}
