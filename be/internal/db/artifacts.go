package db

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Artifact struct {
	ID       string `json:"id"`
	RunID    string `json:"runId"`
	FilePath string `json:"filePath"`
	Diff     string `json:"diff"`
}

type ArtifactStore struct {
	pool *pgxpool.Pool
}

func NewArtifactStore(pool *pgxpool.Pool) *ArtifactStore {
	return &ArtifactStore{pool: pool}
}

func (s *ArtifactStore) Create(ctx context.Context, id, runID, filePath, diff string) (*Artifact, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO artifacts (id, run_id, file_path, diff)
		VALUES ($1, $2, $3, $4)
		RETURNING id, run_id, file_path, diff
	`, id, runID, filePath, diff)
	return scanArtifact(row)
}

func (s *ArtifactStore) ListByCard(ctx context.Context, cardID string) ([]*Artifact, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.run_id, a.file_path, a.diff
		FROM artifacts a
		JOIN runs r ON r.id = a.run_id
		WHERE r.card_id = $1
		ORDER BY a.id
	`, cardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	artifacts := []*Artifact{}
	for rows.Next() {
		a, err := scanArtifact(rows)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, a)
	}
	return artifacts, rows.Err()
}

func (s *ArtifactStore) ListByCardStage(ctx context.Context, cardID, stage string) ([]*Artifact, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.run_id, a.file_path, a.diff
		FROM artifacts a
		JOIN runs r ON r.id = a.run_id
		WHERE r.card_id = $1 AND r.stage = $2
		ORDER BY a.id
	`, cardID, stage)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	artifacts := []*Artifact{}
	for rows.Next() {
		a, err := scanArtifact(rows)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, a)
	}
	return artifacts, rows.Err()
}

func scanArtifact(row rowScanner) (*Artifact, error) {
	var a Artifact
	if err := row.Scan(&a.ID, &a.RunID, &a.FilePath, &a.Diff); err != nil {
		return nil, err
	}
	return &a, nil
}
