package stream

import (
	"sync"
	"time"
)

type Event struct {
	Type  string `json:"type"` // "log" | "diff" | "stage" | "done" | "error" | "chat" | "chat_done"
	Stage string `json:"stage,omitempty"`
	Line  string `json:"line,omitempty"`
	File  string `json:"file,omitempty"`
	Diff  string `json:"diff,omitempty"`
	Data  string `json:"data,omitempty"`
}

type Hub struct {
	mu   sync.Mutex
	subs map[string][]chan Event
}

func NewHub() *Hub {
	return &Hub{subs: make(map[string][]chan Event)}
}

func (h *Hub) Subscribe(cardID string) chan Event {
	ch := make(chan Event, 256)
	h.mu.Lock()
	h.subs[cardID] = append(h.subs[cardID], ch)
	h.mu.Unlock()
	return ch
}

func isTerminal(t string) bool {
	return t == "done" || t == "chat_done" || t == "error"
}

func (h *Hub) Unsubscribe(cardID string, ch chan Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	chans := h.subs[cardID]
	for i, c := range chans {
		if c == ch {
			h.subs[cardID] = append(chans[:i], chans[i+1:]...)
			close(ch)
			break
		}
	}
}

// Publish delivers ev to every subscriber of cardID. Chatty event types
// (log/chat/diff) are dropped under backpressure — losing a line of live
// output is harmless. Terminal events (done/chat_done/error) block briefly
// instead, since dropping one leaves the frontend stuck "thinking" forever.
func (h *Hub) Publish(cardID string, ev Event) {
	h.mu.Lock()
	chans := append([]chan Event(nil), h.subs[cardID]...)
	h.mu.Unlock()

	for _, ch := range chans {
		if isTerminal(ev.Type) {
			select {
			case ch <- ev:
			case <-time.After(5 * time.Second):
			}
			continue
		}
		select {
		case ch <- ev:
		default:
		}
	}
}
