package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"devpipe/be/internal/db"
	"devpipe/be/internal/worktree"
)

type CardHandler struct {
	Store *db.CardStore
}

func (h *CardHandler) Routes(r chi.Router) {
	r.Get("/cards", h.list)
	r.Post("/cards", h.create)
	r.Get("/cards/{id}", h.get)
	r.Patch("/cards/{id}", h.update)
	r.Patch("/cards/{id}/stage", h.updateStage)
	r.Post("/cards/{id}/accept", h.accept)
}

func (h *CardHandler) list(w http.ResponseWriter, r *http.Request) {
	cards, err := h.Store.List(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, cards)
}

type createCardRequest struct {
	Title    string `json:"title"`
	RepoPath string `json:"repoPath"`
	Agent    string `json:"agent"`
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// tempBranch generates an internal working branch name — the user never sees
// or picks this; it exists only so git worktree has something to check out.
// The real branch name is chosen later, at Accept.
func tempBranch(title, cardID string) string {
	slug := slugRe.ReplaceAllString(strings.ToLower(title), "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "card"
	}
	if len(slug) > 40 {
		slug = slug[:40]
	}
	return "devpipe/" + slug + "-" + cardID[:8]
}

func (h *CardHandler) create(w http.ResponseWriter, r *http.Request) {
	var req createCardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Title == "" || req.RepoPath == "" {
		http.Error(w, "title and repoPath required", http.StatusBadRequest)
		return
	}
	if req.Agent == "" {
		req.Agent = "claude"
	}

	id := uuid.NewString()
	branch := tempBranch(req.Title, id)
	prdID := uuid.NewString()

	card, err := h.Store.Create(r.Context(), id, req.Title, req.RepoPath, branch, req.Agent, prdID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, card)
}

type updateCardRequest struct {
	Title    string `json:"title"`
	RepoPath string `json:"repoPath"`
	Agent    string `json:"agent"`
}

func (h *CardHandler) update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateCardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	existing, err := h.Store.Get(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	title, repoPath, agent := existing.Title, existing.RepoPath, existing.Agent
	if req.Title != "" {
		title = req.Title
	}
	if req.RepoPath != "" {
		repoPath = req.RepoPath
	}
	if req.Agent != "" {
		agent = req.Agent
	}

	card, err := h.Store.Update(r.Context(), id, title, repoPath, agent)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, card)
}

func (h *CardHandler) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	card, err := h.Store.Get(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, card)
}

type updateStageRequest struct {
	Stage  string `json:"stage"`
	Status string `json:"status"`
}

func (h *CardHandler) updateStage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateStageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := h.Store.UpdateStage(r.Context(), id, req.Stage, req.Status); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	card, err := h.Store.Get(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, card)
}

type acceptRequest struct {
	Branch string `json:"branch"`
}

func (h *CardHandler) accept(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")

	var req acceptRequest
	_ = json.NewDecoder(r.Body).Decode(&req) // branch is optional — keeps internal name if omitted

	card, err := h.Store.Get(ctx, id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if card.WorktreePath == nil {
		http.Error(w, "no worktree to accept — nothing built yet", http.StatusBadRequest)
		return
	}

	if _, err := worktree.CommitAll(*card.WorktreePath, "devpipe: "+card.Title); err != nil {
		http.Error(w, fmt.Sprintf("commit: %v", err), http.StatusInternalServerError)
		return
	}

	branch := card.Branch
	if req.Branch != "" && req.Branch != card.Branch {
		if err := worktree.RenameBranch(*card.WorktreePath, req.Branch); err != nil {
			http.Error(w, fmt.Sprintf("rename branch: %v", err), http.StatusInternalServerError)
			return
		}
		branch = req.Branch
		if err := h.Store.SetBranch(ctx, id, branch); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	out, err := worktree.Merge(card.RepoPath, branch)
	if err != nil {
		http.Error(w, fmt.Sprintf("merge failed: %v\n%s", err, out), http.StatusConflict)
		return
	}

	if err := h.Store.UpdateStage(ctx, id, "deployed", "success"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	card, err = h.Store.Get(ctx, id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"card": card, "mergeOutput": out})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
