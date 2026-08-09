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
	r.Get("/stream", h.streamAll)
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

// streamAll is the app-wide counterpart to stream — no card ID, subscribes
// to stream.GlobalTopic instead. Used by the sidebar's Active Cards rail
// and the header's running-count pill so they update live from any page.
func (h *StreamHandler) streamAll(w http.ResponseWriter, r *http.Request) {
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

	ch := h.Hub.Subscribe(stream.GlobalTopic)
	defer h.Hub.Unsubscribe(stream.GlobalTopic, ch)

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
