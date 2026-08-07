package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"devpipe/be/internal/agent"
)

type AgentHandler struct{}

func (h *AgentHandler) Routes(r chi.Router) {
	r.Get("/agents/detect", h.detect)
}

func (h *AgentHandler) detect(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, agent.Detect())
}
