package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"devpipe/be/internal/agent"
	"devpipe/be/internal/db"
	"devpipe/be/internal/stream"
	"devpipe/be/internal/worktree"
)

type ChatHandler struct {
	Cards *db.CardStore
	PRDs  *db.PRDStore
	Plans *db.PlanStore
	Tasks *db.TaskStore
	Chats *db.ChatStore
	Hub   *stream.Hub
}

func (h *ChatHandler) Routes(r chi.Router) {
	r.Get("/cards/{id}/chat", h.list)
	r.Post("/cards/{id}/chat", h.send)
}

// docIDParam turns "" into nil — chat_messages.doc_id is NULL for stages
// without multiple drafts (general/simulating/building/testing/docs); a
// missing/empty docId in the request means exactly that.
func docIDParam(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func (h *ChatHandler) list(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")
	stage := r.URL.Query().Get("stage")
	if stage == "" {
		http.Error(w, "stage query param required", http.StatusBadRequest)
		return
	}
	docID := docIDParam(r.URL.Query().Get("docId"))
	messages, err := h.Chats.ListByCardStage(r.Context(), cardID, stage, docID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, messages)
}

type sendChatRequest struct {
	Stage      string `json:"stage"`
	DocID      string `json:"docId"`
	Message    string `json:"message"`
	CurrentDoc string `json:"currentDoc"`
}

func (h *ChatHandler) send(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cardID := chi.URLParam(r, "id")

	var req sendChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Stage == "" || req.Message == "" {
		http.Error(w, "stage and message required", http.StatusBadRequest)
		return
	}
	docID := docIDParam(req.DocID)

	card, err := h.Cards.Get(ctx, cardID)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}

	if _, err := h.Chats.Create(ctx, uuid.NewString(), cardID, req.Stage, "user", req.Message, docID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Persist the doc as the user last saw/edited it, even if they never hit
	// Save — so manual edits aren't lost and the agent's context below reflects them.
	if req.Stage == "prd" && h.PRDs != nil && req.DocID != "" && req.CurrentDoc != "" {
		if _, err := h.PRDs.UpdateContent(ctx, cardID, req.DocID, req.CurrentDoc); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	go h.reply(context.Background(), card, req.Stage, req.DocID, req.CurrentDoc)

	w.WriteHeader(http.StatusAccepted)
}

func (h *ChatHandler) reply(ctx context.Context, card *db.Card, stage, docIDStr, currentDoc string) {
	cardID := card.ID
	docID := docIDParam(docIDStr)

	wtPath, err := worktree.Ensure(card.RepoPath, card.Branch)
	if err != nil {
		h.Hub.Publish(cardID, stream.Event{Type: "error", Stage: stage, Data: fmt.Sprintf("worktree: %v", err)})
		return
	}
	if card.WorktreePath == nil || *card.WorktreePath != wtPath {
		_ = h.Cards.SetWorktreePath(ctx, cardID, wtPath)
	}

	adapter, err := agent.For(card.Agent)
	if err != nil {
		h.Hub.Publish(cardID, stream.Event{Type: "error", Stage: stage, Data: err.Error()})
		return
	}

	history, err := h.Chats.ListByCardStage(ctx, cardID, stage, docID)
	if err != nil {
		h.Hub.Publish(cardID, stream.Event{Type: "error", Stage: stage, Data: err.Error()})
		return
	}

	prompt := buildChatPrompt(stage, history, currentDoc)

	exitCode, content, err := adapter.Invoke(ctx, wtPath, prompt, func(kind agent.EventKind, text string) {
		if kind == agent.EventTool {
			h.Hub.Publish(cardID, stream.Event{Type: "chat", Stage: stage, Line: text})
		} else {
			h.Hub.Publish(cardID, stream.Event{Type: "chat_delta", Stage: stage, Line: text})
		}
	})
	if err != nil || exitCode != 0 {
		h.Hub.Publish(cardID, stream.Event{Type: "error", Stage: stage, Data: fmt.Sprintf("agent invoke failed (exit %d): %v", exitCode, err)})
		return
	}

	if _, err := h.Chats.Create(ctx, uuid.NewString(), cardID, stage, "assistant", content, docID); err != nil {
		h.Hub.Publish(cardID, stream.Event{Type: "error", Stage: stage, Data: err.Error()})
		return
	}

	switch {
	case stage == "prd" && h.PRDs != nil && docIDStr != "":
		if _, err := h.PRDs.UpdateContent(ctx, cardID, docIDStr, content); err != nil {
			h.Hub.Publish(cardID, stream.Event{Type: "error", Stage: stage, Data: err.Error()})
			return
		}
	case stage == "plan" && h.Plans != nil && h.Tasks != nil && docIDStr != "":
		prev, _ := h.Plans.GetLatestByRoot(ctx, cardID, docIDStr)
		if _, err := createPlanVersion(ctx, h.Plans, h.Tasks, cardID, "", content, prev); err != nil {
			h.Hub.Publish(cardID, stream.Event{Type: "error", Stage: stage, Data: err.Error()})
			return
		}
	}

	h.Hub.Publish(cardID, stream.Event{Type: "chat_done", Stage: stage, Data: content})
}

var stageFraming = map[string]string{
	"prd": "You are collaboratively drafting a PRD (product requirements doc) with the user, inside a project tool. " +
		"Respond with the FULL revised PRD document in markdown, incorporating the conversation below. " +
		"Output only the document — no commentary outside it.",
	"plan": "You are collaboratively revising an implementation plan (a numbered task list) with the user, " +
		"inside a project tool. Respond with the FULL revised plan as a numbered list, one concrete step per " +
		"line, format '1. <step>'. Output only the list — no commentary, no headers, nothing else.",
	"simulating": "You are collaboratively drafting a SIMULATION scenario with the user for the changes made " +
		"so far in this worktree — a concrete, executable dry-run verification (e.g., curl calls against a " +
		"running instance of the backend, using a saved/logged-in actor's session or token, hitting the " +
		"new/changed endpoints end-to-end and checking the responses). Discuss and refine the exact scenario " +
		"with the user — which actor/login, which endpoints, in what order, what a correct response looks " +
		"like. Respond with the FULL current scenario as concrete step-by-step instructions (including exact " +
		"commands where relevant) — this is what you yourself will execute when the user runs it. Do not make " +
		"code changes as part of this step, it's verification only.",
	"general": "You are a helpful assistant for this card as a whole, inside a project tool that takes a card " +
		"through PRD -> Plan -> Build -> Simulate -> Test -> Docs -> Deploy. The user may ask about any part of " +
		"that pipeline regardless of which stage is currently active. Just answer conversationally — you are not " +
		"drafting or replacing any document here.",
}

func buildChatPrompt(stage string, history []*db.ChatMessage, currentDoc string) string {
	var b strings.Builder
	if framing, ok := stageFraming[stage]; ok {
		b.WriteString(framing)
	} else {
		fmt.Fprintf(&b, "You are helping the user with the %q step of this project.", stage)
	}

	if currentDoc != "" {
		b.WriteString("\n\nCurrent document — the user may have hand-edited this since the last " +
			"message below, so treat it as the source of truth to revise, not the last assistant reply:\n\n")
		b.WriteString(currentDoc)
	}

	b.WriteString("\n\nConversation so far:\n")
	for _, m := range history {
		role := "User"
		if m.Role == "assistant" {
			role = "Assistant"
		}
		fmt.Fprintf(&b, "%s: %s\n\n", role, m.Content)
	}
	return b.String()
}
