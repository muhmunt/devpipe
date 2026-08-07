package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"

	"devpipe/be/internal/stream"
)

type StreamHandler struct {
	Hub *stream.Hub
}

func (h *StreamHandler) Routes(r chi.Router) {
	r.Get("/cards/{id}/stream", h.stream)
}

func (h *StreamHandler) stream(w http.ResponseWriter, r *http.Request) {
	cardID := chi.URLParam(r, "id")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch := h.Hub.Subscribe(cardID)
	defer h.Hub.Unsubscribe(cardID, ch)

	for {
		select {
		case <-r.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}
