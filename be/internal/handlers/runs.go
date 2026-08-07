package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"devpipe/be/internal/db"
)

type RunHandler struct {
	Runs      *db.RunStore
	Artifacts *db.ArtifactStore
}

func (h *RunHandler) Routes(r chi.Router) {
	r.Get("/cards/{id}/runs", h.list)
	r.Get("/runs/recent", h.recent)
}

func (h *RunHandler) recent(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	runs, err := h.Runs.ListRecent(r.Context(), limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

func (h *RunHandler) list(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	stage := r.URL.Query().Get("stage")
	if stage == "" {
		http.Error(w, "stage query param required", http.StatusBadRequest)
		return
	}

	runs, err := h.Runs.ListByCardStage(ctx, cardID, stage)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	artifacts, err := h.Artifacts.ListByCardStage(ctx, cardID, stage)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"runs": runs, "artifacts": artifacts})
}
