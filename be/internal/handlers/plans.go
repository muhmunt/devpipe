package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"devpipe/be/internal/agent"
	"devpipe/be/internal/db"
	"devpipe/be/internal/stream"
	"devpipe/be/internal/worktree"
)

type PlanHandler struct {
	Cards *db.CardStore
	PRDs  *db.PRDStore
	Plans *db.PlanStore
	Tasks *db.TaskStore
	Hub   *stream.Hub
}

func (h *PlanHandler) Routes(r chi.Router) {
	r.Get("/cards/{id}/plans", h.list)
	r.Post("/cards/{id}/plans/generate", h.generate)
	r.Post("/cards/{id}/plans/import", h.importPlan)
	r.Get("/cards/{id}/plans/{planId}", h.get)
	r.Patch("/cards/{id}/plans/{planId}", h.updateTitle)
	r.Delete("/cards/{id}/plans/{planId}", h.delete)
	r.Post("/cards/{id}/plans/{planId}/activate", h.activate)
	r.Post("/cards/{id}/plans/{planId}/approve", h.approve)
	r.Post("/cards/{id}/plans/{planId}/tasks", h.addTask)
	r.Patch("/cards/{id}/plans/{planId}/tasks/{taskId}", h.updateTask)
	r.Delete("/cards/{id}/plans/{planId}/tasks/{taskId}", h.deleteTask)
}

var numberedLineRe = regexp.MustCompile(`^\s*\d+[\.\)]\s+(.+)$`)

// createPlanVersion parses a numbered-list agent response into a new Plan
// version + its Task rows. Pass prev=nil to start a brand-new draft lineage
// (title required); pass the lineage's current leaf as prev to append a
// revision to it (title carries over from the lineage, ignoring the title
// param). Shared by the "Generate Plan" bootstrap/regenerate and chat-driven
// revisions — the caller resolves prev via GetLatestByRoot beforehand so
// this function never has to guess which lineage a revision belongs to.
func createPlanVersion(ctx context.Context, plans *db.PlanStore, tasks *db.TaskStore, cardID, title, content string, prev *db.Plan) (*db.Plan, error) {
	id := uuid.NewString()
	version := 1
	var parentID *string
	rootID := id
	if prev != nil {
		version = prev.Version + 1
		parentID = &prev.ID
		rootID = prev.RootID
		title = prev.Title
	}

	plan, err := plans.Create(ctx, id, cardID, title, content, parentID, rootID, version)
	if err != nil {
		return nil, err
	}

	order := 1
	for _, line := range strings.Split(content, "\n") {
		m := numberedLineRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		if _, err := tasks.Create(ctx, uuid.NewString(), plan.ID, m[1], order); err != nil {
			return nil, err
		}
		order++
	}

	return plan, nil
}

func (h *PlanHandler) list(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")
	plans, err := h.Plans.ListByCard(r.Context(), cardID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, plans)
}

type generatePlanRequest struct {
	PRDID string `json:"prdId"`
	Title string `json:"title"`
}

func (h *PlanHandler) generate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")

	var req generatePlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.PRDID == "" {
		http.Error(w, "prdId required", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		req.Title = "New plan"
	}

	card, err := h.Cards.Get(ctx, cardID)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}
	prd, err := h.PRDs.GetByID(ctx, cardID, req.PRDID)
	if err != nil {
		http.Error(w, "PRD not found", http.StatusBadRequest)
		return
	}

	wtPath, err := worktree.Ensure(card.RepoPath, card.Branch)
	if err != nil {
		http.Error(w, fmt.Sprintf("worktree: %v", err), http.StatusInternalServerError)
		return
	}
	if card.WorktreePath == nil || *card.WorktreePath != wtPath {
		if err := h.Cards.SetWorktreePath(ctx, cardID, wtPath); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	adapter, err := agent.For(card.Agent)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	prompt := "Based on this PRD, output a numbered list of concrete implementation steps, " +
		"one per line, format '1. <step>'. Output only the list, nothing else.\n\nPRD:\n\n" + prd.Content

	_, content, err := adapter.Invoke(ctx, wtPath, prompt, func(kind agent.EventKind, text string) {
		if kind == agent.EventTool {
			h.Hub.Publish(cardID, stream.Event{Type: "log", Stage: "plan", Line: text})
		} else {
			h.Hub.Publish(cardID, stream.Event{Type: "log_delta", Stage: "plan", Line: text})
		}
	})
	if err != nil {
		http.Error(w, fmt.Sprintf("agent invoke: %v", err), http.StatusInternalServerError)
		return
	}

	plan, err := createPlanVersion(ctx, h.Plans, h.Tasks, cardID, req.Title, content, nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// The very first plan a card ever gets has nothing to compete with, so
	// activating it automatically preserves today's single-plan UX exactly.
	// Later "new draft"/"regenerate" generations do NOT auto-activate —
	// they're explicitly creating an additional draft alongside whatever's
	// already active, and switching should be a deliberate choice.
	if card.ActivePlanID == nil {
		if err := h.Cards.SetActivePlan(ctx, cardID, plan.RootID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	if err := h.Cards.UpdateStage(ctx, cardID, "plan", "success"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: cardID, Stage: "plan", Data: "success"})

	h.Hub.Publish(cardID, stream.Event{Type: "done", Stage: "plan"})
	h.respondWithPlan(w, r, plan)
}

func (h *PlanHandler) get(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")
	plan, err := h.Plans.GetLatestByRoot(r.Context(), cardID, planID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	h.respondWithPlan(w, r, plan)
}

func (h *PlanHandler) respondWithPlan(w http.ResponseWriter, r *http.Request, plan *db.Plan) {
	tasks, err := h.Tasks.ListByPlan(r.Context(), plan.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plan": plan, "tasks": tasks})
}

type updatePlanTitleRequest struct {
	Title string `json:"title"`
}

func (h *PlanHandler) updateTitle(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")
	var req updatePlanTitleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
		http.Error(w, "title required", http.StatusBadRequest)
		return
	}
	plan, err := h.Plans.GetLatestByRoot(ctx, cardID, planID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// Rename the whole lineage — every version row shares one title.
	if err := h.Plans.RenameLineage(ctx, cardID, planID, req.Title); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	plan.Title = req.Title
	writeJSON(w, http.StatusOK, plan)
}

func (h *PlanHandler) delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")

	card, err := h.Cards.Get(ctx, cardID)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}
	if card.ActivePlanID != nil && *card.ActivePlanID == planID {
		http.Error(w, "can't delete the active plan — activate a different one first", http.StatusBadRequest)
		return
	}
	if err := h.Plans.Delete(ctx, cardID, planID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *PlanHandler) activate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")

	if err := h.Cards.SetActivePlan(ctx, cardID, planID); err != nil {
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

type importPlanRequest struct {
	SourceCardID string `json:"sourceCardId"`
	SourcePlanID string `json:"sourcePlanId"`
	Title        string `json:"title"`
}

func (h *PlanHandler) importPlan(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	targetCardID := chi.URLParam(r, "id")
	var req importPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SourceCardID == "" || req.SourcePlanID == "" {
		http.Error(w, "sourceCardId and sourcePlanId required", http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		source, err := h.Cards.Get(ctx, req.SourceCardID)
		if err == nil {
			req.Title = "Imported from " + source.Title
		} else {
			req.Title = "Imported plan"
		}
	}
	plan, _, err := h.Plans.ImportFrom(ctx, h.Tasks, uuid.NewString(), req.SourceCardID, req.SourcePlanID, targetCardID, req.Title, uuid.NewString)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.respondWithPlan(w, r, plan)
}

func (h *PlanHandler) approve(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")
	plan, err := h.Plans.GetLatestByRoot(ctx, cardID, planID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err := h.Plans.Approve(ctx, plan.ID, "user"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if card, err := h.Cards.Get(ctx, cardID); err == nil && card.ActivePlanID != nil && *card.ActivePlanID == planID {
		if err := h.Cards.UpdateStage(ctx, cardID, "approved", "idle"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: cardID, Stage: "approved", Data: "idle"})
	}
	plan.Status = "approved"
	h.respondWithPlan(w, r, plan)
}

type addTaskRequest struct {
	Title string `json:"title"`
}

func (h *PlanHandler) addTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")
	var req addTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
		http.Error(w, "title required", http.StatusBadRequest)
		return
	}
	plan, err := h.Plans.GetLatestByRoot(ctx, cardID, planID)
	if err != nil {
		http.Error(w, "plan not found", http.StatusBadRequest)
		return
	}
	existing, err := h.Tasks.ListByPlan(ctx, plan.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	task, err := h.Tasks.Create(ctx, uuid.NewString(), plan.ID, req.Title, len(existing)+1)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, task)
}

type updateTaskRequest struct {
	Title *string `json:"title"`
	Order *int    `json:"order"`
}

func (h *PlanHandler) updateTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")
	taskID := chi.URLParam(r, "taskId")

	ok, err := h.Tasks.BelongsToLineage(ctx, taskID, cardID, planID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	var req updateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Title != nil {
		if err := h.Tasks.UpdateTitle(ctx, taskID, *req.Title); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if req.Order != nil {
		if err := h.Tasks.UpdateOrder(ctx, taskID, *req.Order); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *PlanHandler) deleteTask(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	planID := chi.URLParam(r, "planId")
	taskID := chi.URLParam(r, "taskId")

	ok, err := h.Tasks.BelongsToLineage(ctx, taskID, cardID, planID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if err := h.Tasks.Delete(ctx, taskID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
