package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"devpipe/be/internal/agent"
	"devpipe/be/internal/db"
	"devpipe/be/internal/stream"
	"devpipe/be/internal/worktree"
)

type BuildHandler struct {
	Cards     *db.CardStore
	Plans     *db.PlanStore
	Tasks     *db.TaskStore
	Runs      *db.RunStore
	Artifacts *db.ArtifactStore
	Chats     *db.ChatStore
	Hub       *stream.Hub
}

var stageOrder = []string{"prd", "plan", "approved", "building", "simulating", "testing", "docs", "deployed"}

var stagePrompt = map[string]string{
	"simulating": "Do a dry-run review of the changes made so far in this worktree. Report any risks. Do not make further code changes.",
	"testing":    "Run the test suite for this project and report pass/fail results.",
	"docs":       "Generate API documentation for any endpoints added or changed in this worktree.",
}

func nextStage(current string) (string, bool) {
	for i, s := range stageOrder {
		if s == current && i+1 < len(stageOrder) {
			return stageOrder[i+1], true
		}
	}
	return "", false
}

func (h *BuildHandler) Routes(r chi.Router) {
	r.Post("/cards/{id}/build/run", h.run)
}

func (h *BuildHandler) run(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")
	card, err := h.Cards.Get(ctx, cardID)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}

	// A task can be left stuck at "running" if a previous run got interrupted
	// (server restart, crash) mid-task — nothing is actually executing it
	// anymore. Clear that before starting so it's picked up fresh instead of
	// looking permanently stuck.
	if card.Stage == "building" && card.ActivePlanID != nil {
		if plan, err := h.Plans.GetLatestByRoot(ctx, cardID, *card.ActivePlanID); err == nil {
			if tasks, err := h.Tasks.ListByPlan(ctx, plan.ID); err == nil {
				for _, t := range tasks {
					if t.Status == "running" {
						_ = h.Tasks.UpdateStatus(ctx, t.ID, "idle")
					}
				}
			}
		}
	}

	if err := h.Cards.UpdateStage(ctx, cardID, card.Stage, "running"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	go h.execute(context.Background(), card)

	w.WriteHeader(http.StatusAccepted)
}

func (h *BuildHandler) execute(ctx context.Context, card *db.Card) {
	cardID := card.ID

	wtPath, err := worktree.Ensure(card.RepoPath, card.Branch)
	if err != nil {
		h.fail(ctx, card, fmt.Sprintf("worktree: %v", err))
		return
	}
	if card.WorktreePath == nil || *card.WorktreePath != wtPath {
		_ = h.Cards.SetWorktreePath(ctx, cardID, wtPath)
	}

	adapter, err := agent.For(card.Agent)
	if err != nil {
		h.fail(ctx, card, err.Error())
		return
	}

	var stageErr error
	switch card.Stage {
	case "building":
		stageErr = h.runTasks(ctx, card, wtPath, adapter)
	default:
		if prompt, ok := stagePrompt[card.Stage]; ok {
			prompt = h.resolvePrompt(ctx, cardID, card.Stage, prompt)
			stageErr = h.runSingle(ctx, card, wtPath, adapter, card.Stage, prompt)
		}
	}

	if stageErr != nil {
		h.fail(ctx, card, stageErr.Error())
		return
	}

	next, ok := nextStage(card.Stage)
	if !ok {
		next = card.Stage
	}
	if err := h.Cards.UpdateStage(ctx, cardID, next, "idle"); err != nil {
		log.Printf("update stage: %v", err)
	}
	h.Hub.Publish(cardID, stream.Event{Type: "stage", Stage: card.Stage, Data: next})
	h.Hub.Publish(cardID, stream.Event{Type: "done", Stage: card.Stage})
}

// resolvePrompt lets the user chat-refine a stage's execution instructions
// first (same pattern as PRD/Plan) — if they've discussed a scenario with the
// agent for this stage, that becomes the actual run prompt instead of the
// generic default. Falls back to the default when no chat happened.
func (h *BuildHandler) resolvePrompt(ctx context.Context, cardID, stage, fallback string) string {
	if h.Chats == nil {
		return fallback
	}
	msgs, err := h.Chats.ListByCardStage(ctx, cardID, stage, nil)
	if err != nil {
		return fallback
	}
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == "assistant" {
			return msgs[i].Content
		}
	}
	return fallback
}

func (h *BuildHandler) runTasks(ctx context.Context, card *db.Card, wtPath string, ad agent.Adapter) error {
	if card.ActivePlanID == nil {
		return fmt.Errorf("no active plan selected for this card — choose or generate one before building")
	}
	plan, err := h.Plans.GetLatestByRoot(ctx, card.ID, *card.ActivePlanID)
	if err != nil {
		return fmt.Errorf("active plan not found: %w", err)
	}
	if plan.Status != "approved" {
		return fmt.Errorf("active plan %q is not approved — approve it before building", plan.Title)
	}
	tasks, err := h.Tasks.ListByPlan(ctx, plan.ID)
	if err != nil {
		return err
	}
	total := len(tasks)

	for i, task := range tasks {
		if task.Status == "success" {
			continue
		}
		h.Hub.Publish(card.ID, stream.Event{Type: "log", Stage: card.Stage, Line: "▶ " + task.Title})
		_ = h.Tasks.UpdateStatus(ctx, task.ID, "running")
		h.publishTaskProgress(card.ID, card.Stage, task.ID, task.Title, "running", i+1, total)

		taskID := task.ID
		run, err := h.Runs.Create(ctx, uuid.NewString(), card.ID, &taskID, card.Stage, card.Agent, task.Title)
		if err != nil {
			return err
		}

		var display strings.Builder
		display.WriteString("▶ " + task.Title + "\n")
		exitCode, _, err := ad.Invoke(ctx, wtPath, task.Title, func(kind agent.EventKind, text string) {
			if kind == agent.EventTool {
				display.WriteString(text)
				display.WriteString("\n")
				h.Hub.Publish(card.ID, stream.Event{Type: "log", Stage: card.Stage, Line: text})
			} else {
				display.WriteString(text)
				h.Hub.Publish(card.ID, stream.Event{Type: "log_delta", Stage: card.Stage, Line: text})
			}
		})
		_ = h.Runs.SetOutput(ctx, run.ID, display.String())
		_ = h.Runs.Finish(ctx, run.ID, exitCode)

		if err != nil || exitCode != 0 {
			_ = h.Tasks.UpdateStatus(ctx, task.ID, "failed")
			h.publishTaskProgress(card.ID, card.Stage, task.ID, task.Title, "failed", i+1, total)
			return fmt.Errorf("task %q failed (exit %d): %v", task.Title, exitCode, err)
		}
		_ = h.Tasks.UpdateStatus(ctx, task.ID, "success")
		h.publishTaskProgress(card.ID, card.Stage, task.ID, task.Title, "success", i+1, total)

		if err := h.captureDiff(ctx, wtPath, run.ID, card.ID, card.Stage); err != nil {
			log.Printf("capture diff: %v", err)
		}
	}
	return nil
}

type taskProgress struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Index  int    `json:"index"`
	Total  int    `json:"total"`
}

func (h *BuildHandler) publishTaskProgress(cardID, stage, taskID, title, status string, index, total int) {
	data, err := json.Marshal(taskProgress{TaskID: taskID, Title: title, Status: status, Index: index, Total: total})
	if err != nil {
		return
	}
	h.Hub.Publish(cardID, stream.Event{Type: "task", Stage: stage, Data: string(data)})
}

func (h *BuildHandler) runSingle(ctx context.Context, card *db.Card, wtPath string, ad agent.Adapter, stage, prompt string) error {
	h.Hub.Publish(card.ID, stream.Event{Type: "log", Stage: stage, Line: "▶ " + stage})
	run, err := h.Runs.Create(ctx, uuid.NewString(), card.ID, nil, stage, card.Agent, prompt)
	if err != nil {
		return err
	}

	var display strings.Builder
	display.WriteString("▶ " + stage + "\n")
	exitCode, _, err := ad.Invoke(ctx, wtPath, prompt, func(kind agent.EventKind, text string) {
		if kind == agent.EventTool {
			display.WriteString(text)
			display.WriteString("\n")
			h.Hub.Publish(card.ID, stream.Event{Type: "log", Stage: stage, Line: text})
		} else {
			display.WriteString(text)
			h.Hub.Publish(card.ID, stream.Event{Type: "log_delta", Stage: stage, Line: text})
		}
	})
	_ = h.Runs.SetOutput(ctx, run.ID, display.String())
	_ = h.Runs.Finish(ctx, run.ID, exitCode)

	if err != nil || exitCode != 0 {
		return fmt.Errorf("%s failed (exit %d): %v", stage, exitCode, err)
	}

	if err := h.captureDiff(ctx, wtPath, run.ID, card.ID, stage); err != nil {
		log.Printf("capture diff: %v", err)
	}
	return nil
}

func (h *BuildHandler) captureDiff(ctx context.Context, wtPath, runID, cardID, stage string) error {
	files, err := worktree.ChangedFiles(wtPath)
	if err != nil {
		return err
	}
	for _, file := range files {
		patch, err := worktree.DiffFile(wtPath, file)
		if err != nil {
			log.Printf("diff %s: %v", file, err)
			continue
		}
		if _, err := h.Artifacts.Create(ctx, uuid.NewString(), runID, file, patch); err != nil {
			return err
		}
		h.Hub.Publish(cardID, stream.Event{Type: "diff", Stage: stage, File: file, Diff: patch})
	}
	return nil
}

func (h *BuildHandler) fail(ctx context.Context, card *db.Card, msg string) {
	log.Printf("build failed for card %s: %s", card.ID, msg)
	_ = h.Cards.UpdateStage(ctx, card.ID, card.Stage, "failed")
	h.Hub.Publish(card.ID, stream.Event{Type: "error", Stage: card.Stage, Data: msg})
}
