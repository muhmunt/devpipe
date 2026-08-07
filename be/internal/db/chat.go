package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ChatMessage struct {
	ID        string    `json:"id"`
	CardID    string    `json:"cardId"`
	Stage     string    `json:"stage"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	DocID     *string   `json:"docId"`
	CreatedAt time.Time `json:"createdAt"`
}

type ChatStore struct {
	pool *pgxpool.Pool
}

func NewChatStore(pool *pgxpool.Pool) *ChatStore {
	return &ChatStore{pool: pool}
}

// docID scopes a message to a specific PRD/Plan draft (its id for PRDs, its
// root_id for Plans) — nil for stages that don't have multiple drafts
// (general/simulating/building/testing/docs).
func (s *ChatStore) Create(ctx context.Context, id, cardID, stage, role, content string, docID *string) (*ChatMessage, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO chat_messages (id, card_id, stage, role, content, doc_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, card_id, stage, role, content, doc_id, created_at
	`, id, cardID, stage, role, content, docID)
	return scanChatMessage(row)
}

// ListByCardStage matches docID with NULL-safe equality (`IS NOT DISTINCT
// FROM`) — plain `=` never matches NULL, and non-draft stages must keep
// matching their existing NULL-doc_id rows.
func (s *ChatStore) ListByCardStage(ctx context.Context, cardID, stage string, docID *string) ([]*ChatMessage, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, card_id, stage, role, content, doc_id, created_at
		FROM chat_messages WHERE card_id = $1 AND stage = $2 AND doc_id IS NOT DISTINCT FROM $3
		ORDER BY created_at ASC
	`, cardID, stage, docID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []*ChatMessage{}
	for rows.Next() {
		m, err := scanChatMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

func scanChatMessage(row rowScanner) (*ChatMessage, error) {
	var m ChatMessage
	if err := row.Scan(&m.ID, &m.CardID, &m.Stage, &m.Role, &m.Content, &m.DocID, &m.CreatedAt); err != nil {
		return nil, err
	}
	return &m, nil
}
