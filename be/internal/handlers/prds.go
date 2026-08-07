package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"devpipe/be/internal/agent"
	"devpipe/be/internal/db"
	"devpipe/be/internal/worktree"
)

type PRDHandler struct {
	Store *db.PRDStore
	Cards *db.CardStore
}

func (h *PRDHandler) Routes(r chi.Router) {
	r.Get("/cards/{id}/prds", h.list)
	r.Post("/cards/{id}/prds", h.create)
	r.Post("/cards/{id}/prds/import", h.importPRD)
	r.Get("/cards/{id}/prds/{prdId}", h.get)
	r.Patch("/cards/{id}/prds/{prdId}", h.update)
	r.Delete("/cards/{id}/prds/{prdId}", h.delete)
	r.Post("/cards/{id}/prds/{prdId}/activate", h.activate)
	r.Post("/cards/{id}/prds/{prdId}/diagram", h.generateDiagram)
}

func (h *PRDHandler) list(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")
	prds, err := h.Store.ListByCard(r.Context(), cardID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, prds)
}

type createPRDRequest struct {
	Title string `json:"title"`
}

func (h *PRDHandler) create(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")
	var req createPRDRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Title == "" {
		req.Title = "New draft"
	}
	prd, err := h.Store.Create(r.Context(), uuid.NewString(), cardID, req.Title)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, prd)
}

func (h *PRDHandler) get(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")
	prdID := chi.URLParam(r, "prdId")
	prd, err := h.Store.GetByID(r.Context(), cardID, prdID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, prd)
}

type updatePRDRequest struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

func (h *PRDHandler) update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	prdID := chi.URLParam(r, "prdId")

	existing, err := h.Store.GetByID(ctx, cardID, prdID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	var req updatePRDRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	title, content := existing.Title, req.Content
	if req.Title != "" {
		title = req.Title
	}
	prd, err := h.Store.Update(ctx, cardID, prdID, title, content)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, prd)
}

func (h *PRDHandler) delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	prdID := chi.URLParam(r, "prdId")

	card, err := h.Cards.Get(ctx, cardID)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}
	if card.ActivePRDID == prdID {
		http.Error(w, "can't delete the active draft — activate a different one first", http.StatusBadRequest)
		return
	}
	all, err := h.Store.ListByCard(ctx, cardID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(all) <= 1 {
		http.Error(w, "can't delete the last remaining draft", http.StatusBadRequest)
		return
	}
	if err := h.Store.Delete(ctx, cardID, prdID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *PRDHandler) activate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	prdID := chi.URLParam(r, "prdId")

	if err := h.Cards.SetActivePRD(ctx, cardID, prdID); err != nil {
		if errors.Is(err, db.ErrNotOwned) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	card, err := h.Cards.Get(ctx, cardID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, card)
}

type importPRDRequest struct {
	SourceCardID string `json:"sourceCardId"`
	SourcePRDID  string `json:"sourcePrdId"`
	Title        string `json:"title"`
}

func (h *PRDHandler) importPRD(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetCardID := chi.URLParam(r, "id")
	var req importPRDRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SourceCardID == "" || req.SourcePRDID == "" {
		http.Error(w, "sourceCardId and sourcePrdId required", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		source, err := h.Cards.Get(ctx, req.SourceCardID)
		if err == nil {
			req.Title = "Imported from " + source.Title
		} else {
			req.Title = "Imported draft"
		}
	}
	prd, err := h.Store.ImportFrom(ctx, uuid.NewString(), req.SourceCardID, req.SourcePRDID, targetCardID, req.Title)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, prd)
}

var mermaidFenceRe = regexp.MustCompile("(?s)```(?:mermaid)?\\s*\\n(.*?)\\n?```")

func (h *PRDHandler) generateDiagram(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	prdID := chi.URLParam(r, "prdId")

	card, err := h.Cards.Get(ctx, cardID)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}
	prd, err := h.Store.GetByID(ctx, cardID, prdID)
	if err != nil || prd.Content == "" {
		http.Error(w, "PRD required before generating a diagram", http.StatusBadRequest)
		return
	}

	wtPath, err := worktree.Ensure(card.RepoPath, card.Branch)
	if err != nil {
		http.Error(w, "worktree: "+err.Error(), http.StatusInternalServerError)
		return
	}

	adapter, err := agent.For(card.Agent)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	prompt := "Based on this PRD, output a single Mermaid diagram (flowchart or sequence diagram, " +
		"whichever fits the described flow best) visualizing the main flow or architecture. " +
		"Output ONLY a single ```mermaid code block — no other text before or after it.\n\nPRD:\n\n" + prd.Content

	_, content, err := adapter.Invoke(ctx, wtPath, prompt, func(agent.EventKind, string) {})
	if err != nil {
		http.Error(w, "agent invoke: "+err.Error(), http.StatusInternalServerError)
		return
	}

	diagram := content
	if m := mermaidFenceRe.FindStringSubmatch(content); m != nil {
		diagram = m[1]
	}
	diagram = strings.TrimSpace(diagram)

	if err := h.Store.SetDiagram(ctx, cardID, prdID, diagram); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	updated, err := h.Store.GetByID(ctx, cardID, prdID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}
