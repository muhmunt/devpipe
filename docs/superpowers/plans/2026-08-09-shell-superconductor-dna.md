# App Shell — Superconductor DNA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make devpipe's running/active work visible from anywhere in the app — a live "Active Cards" rail in the persistent sidebar plus a running-count pill in the header, driven by a new global SSE stream — closing the one real structural gap found between devpipe's shell and the studied Superconductor reference (nav shape, chat bar, and pill/chip treatment were all already close or complete before this plan).

**Architecture:** A new global pub/sub topic on the existing `stream.Hub` (reused, not a new type), published from the 7 backend call sites that change a card's stage/status, exposed over a new `GET /stream` SSE route. The frontend's `AppShell` subscribes once per mount and refetches the card list on each event; a new presentational `ActiveCardsRail` component renders it in the sidebar.

**Tech Stack:** Go (chi router, existing `stream.Hub`), React/TS (`EventSource`, existing `api.ts` client pattern).

## Global Constraints

- No FE automated test framework exists in this repo — verification is `cd fe && npx tsc -b --noEmit` (must be clean) plus real manual runs. `go build ./...` and `go vet ./...` (run from `be/`) are the backend equivalent.
- This plan touches real backend behavior (not just FE prop-wiring) — static checks (`tsc`, `go build`) catch compile errors but cannot confirm the SSE pub/sub fires end-to-end. The final task requires an actual run against a live Postgres + backend + frontend, not just code-reading.
- `fe/src/lib/statusMeta.ts`'s `STATUS_META` is the single source of truth for status icon/color — reuse it, never re-derive status colors.
- No changes to `CardDetail.tsx`, its stage components, pill/chip treatment (already complete, confirmed by audit), or nav shape (already a side-rail) — this plan is scoped to `AppShell.tsx` + one new component + the backend SSE plumbing only.
- `AppShell` remounts on every page navigation (each of the 8 pages renders its own `<AppShell>` instance — confirmed in `fe/src/App.tsx`) — the `EventSource` reconnects per page view, not once per app session. This is accepted, not a bug to fix in this plan.

---

## File Structure

| File | Change | Responsibility after this plan |
|---|---|---|
| `be/internal/stream/hub.go` | modified | Adds `CardID` field to `Event` + `GlobalTopic` constant — no behavior change to existing per-card pub/sub. |
| `be/internal/handlers/cards.go` | modified | `CardHandler` gains `Hub`; publishes `card_status` after its 2 `UpdateStage` calls. |
| `be/internal/handlers/build.go` | modified | Publishes `card_status` after its 3 `UpdateStage` calls (already has `Hub`). |
| `be/internal/handlers/plans.go` | modified | Publishes `card_status` after its 2 `UpdateStage` calls (already has `Hub`). |
| `be/internal/handlers/stream.go` | modified | Gains a second route, `GET /stream`, for the global topic. |
| `be/cmd/api/main.go` | modified | Wires `Hub` into `CardHandler`'s construction. |
| `fe/src/lib/types.ts` | modified | `StreamEvent` gains `'card_status'` to its type union and an optional `cardId` field. |
| `fe/src/lib/api.ts` | modified | Adds `streamAllUrl()`. |
| `fe/src/components/AppShell.tsx` | modified | Owns the polled/streamed card list; renders the rail + header count-pill. |
| `fe/src/components/ActiveCardsRail.tsx` | **new** | Presentational: renders a capped, sorted list of cards with status icons, links to each card, and a "N more on Board" overflow link. |

---

### Task 1: `stream.Hub` — add `CardID` field and `GlobalTopic` constant

**Files:**
- Modify: `be/internal/stream/hub.go`

**Interfaces:**
- Produces: `stream.Event.CardID string` (new field, `json:"cardId,omitempty"`), `stream.GlobalTopic` (new exported `const string = "__global__"`). Every later backend task publishes to `GlobalTopic` using this exact field name.

- [ ] **Step 1: Add the `CardID` field to `Event` and the `GlobalTopic` constant**

In `be/internal/stream/hub.go`, replace:

```go
type Event struct {
	Type  string `json:"type"` // "log" | "diff" | "stage" | "done" | "error" | "chat" | "chat_done"
	Stage string `json:"stage,omitempty"`
	Line  string `json:"line,omitempty"`
	File  string `json:"file,omitempty"`
	Diff  string `json:"diff,omitempty"`
	Data  string `json:"data,omitempty"`
}
```

with:

```go
type Event struct {
	Type   string `json:"type"` // "log" | "diff" | "stage" | "done" | "error" | "chat" | "chat_done" | "card_status"
	Stage  string `json:"stage,omitempty"`
	Line   string `json:"line,omitempty"`
	File   string `json:"file,omitempty"`
	Diff   string `json:"diff,omitempty"`
	Data   string `json:"data,omitempty"`
	CardID string `json:"cardId,omitempty"` // set on "card_status" events published to GlobalTopic
}

// GlobalTopic is the reserved Hub key for app-wide events (currently just
// "card_status") that aren't scoped to one card's own stream — subscribed
// to via GET /api/stream, separate from the per-card /cards/{id}/stream.
const GlobalTopic = "__global__"
```

Nothing else in the file changes — `Hub.Subscribe`/`Publish`/`Unsubscribe` are already generic over the `cardID string` key parameter, so they work unmodified for `GlobalTopic` too (it's just another map key).

- [ ] **Step 2: Verify**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be && go build ./... && go vet ./...
```

Expected: both clean, no output.

- [ ] **Step 3: Commit**

```bash
git add be/internal/stream/hub.go
git commit -m "feat: add CardID field and GlobalTopic to stream.Hub"
```

---

### Task 2: Publish `card_status` after every stage/status change (7 call sites across 3 files) + wire `CardHandler`'s `Hub`

**Files:**
- Modify: `be/internal/handlers/cards.go`
- Modify: `be/internal/handlers/build.go`
- Modify: `be/internal/handlers/plans.go`
- Modify: `be/cmd/api/main.go`

**Interfaces:**
- Consumes: `stream.Event`, `stream.GlobalTopic` from Task 1.
- Produces: nothing new for later tasks (this is the last backend-logic task before the route).

- [ ] **Step 1: `cards.go` — add `Hub` field, import, and publish after both `UpdateStage` calls**

Add the import (alongside the existing `devpipe/be/internal/worktree` import):

```go
"devpipe/be/internal/stream"
```

Replace the struct:

```go
type CardHandler struct {
	Store *db.CardStore
}
```

with:

```go
type CardHandler struct {
	Store *db.CardStore
	Hub   *stream.Hub
}
```

In `updateStage`, replace:

```go
	if err := h.Store.UpdateStage(r.Context(), id, req.Stage, req.Status); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	card, err := h.Store.Get(r.Context(), id)
```

with:

```go
	if err := h.Store.UpdateStage(r.Context(), id, req.Stage, req.Status); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: id, Stage: req.Stage, Data: req.Status})
	card, err := h.Store.Get(r.Context(), id)
```

In `accept`, replace:

```go
	if err := h.Store.UpdateStage(ctx, id, "deployed", "success"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	card, err = h.Store.Get(ctx, id)
```

with:

```go
	if err := h.Store.UpdateStage(ctx, id, "deployed", "success"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: id, Stage: "deployed", Data: "success"})
	card, err = h.Store.Get(ctx, id)
```

- [ ] **Step 2: `build.go` — publish after its 3 `UpdateStage` calls**

`build.go` already imports `devpipe/be/internal/stream` and has `Hub *stream.Hub` — no struct/import changes needed here.

In `run()`, replace:

```go
	if err := h.Cards.UpdateStage(ctx, cardID, card.Stage, "running"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	go h.execute(context.Background(), card)
```

with:

```go
	if err := h.Cards.UpdateStage(ctx, cardID, card.Stage, "running"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: cardID, Stage: card.Stage, Data: "running"})

	go h.execute(context.Background(), card)
```

In `execute()`, replace:

```go
	if err := h.Cards.UpdateStage(ctx, cardID, next, "idle"); err != nil {
		log.Printf("update stage: %v", err)
	}
	h.Hub.Publish(cardID, stream.Event{Type: "stage", Stage: card.Stage, Data: next})
	h.Hub.Publish(cardID, stream.Event{Type: "done", Stage: card.Stage})
```

with:

```go
	if err := h.Cards.UpdateStage(ctx, cardID, next, "idle"); err != nil {
		log.Printf("update stage: %v", err)
	}
	h.Hub.Publish(cardID, stream.Event{Type: "stage", Stage: card.Stage, Data: next})
	h.Hub.Publish(cardID, stream.Event{Type: "done", Stage: card.Stage})
	h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: cardID, Stage: next, Data: "idle"})
```

In `fail()`, replace:

```go
	_ = h.Cards.UpdateStage(ctx, card.ID, card.Stage, "failed")
	h.Hub.Publish(card.ID, stream.Event{Type: "error", Stage: card.Stage, Data: msg})
```

with:

```go
	_ = h.Cards.UpdateStage(ctx, card.ID, card.Stage, "failed")
	h.Hub.Publish(card.ID, stream.Event{Type: "error", Stage: card.Stage, Data: msg})
	h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: card.ID, Stage: card.Stage, Data: "failed"})
```

- [ ] **Step 3: `plans.go` — publish after its 2 `UpdateStage` calls**

`plans.go` already imports `devpipe/be/internal/stream` and has `Hub *stream.Hub` — no struct/import changes needed here.

In `generate()`, replace:

```go
	if err := h.Cards.UpdateStage(ctx, cardID, "plan", "success"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.Hub.Publish(cardID, stream.Event{Type: "done", Stage: "plan"})
```

with:

```go
	if err := h.Cards.UpdateStage(ctx, cardID, "plan", "success"); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: cardID, Stage: "plan", Data: "success"})

	h.Hub.Publish(cardID, stream.Event{Type: "done", Stage: "plan"})
```

In `approve()`, replace:

```go
	if card, err := h.Cards.Get(ctx, cardID); err == nil && card.ActivePlanID != nil && *card.ActivePlanID == planID {
		if err := h.Cards.UpdateStage(ctx, cardID, "approved", "idle"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
```

with:

```go
	if card, err := h.Cards.Get(ctx, cardID); err == nil && card.ActivePlanID != nil && *card.ActivePlanID == planID {
		if err := h.Cards.UpdateStage(ctx, cardID, "approved", "idle"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		h.Hub.Publish(stream.GlobalTopic, stream.Event{Type: "card_status", CardID: cardID, Stage: "approved", Data: "idle"})
	}
```

- [ ] **Step 4: `main.go` — wire `Hub` into `CardHandler`**

Replace:

```go
	cardHandler := &handlers.CardHandler{Store: cardStore}
```

with:

```go
	cardHandler := &handlers.CardHandler{Store: cardStore, Hub: hub}
```

(`hub := stream.NewHub()` is already declared above this line in `main.go` — no reordering needed.)

- [ ] **Step 5: Verify**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be && go build ./... && go vet ./...
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add be/internal/handlers/cards.go be/internal/handlers/build.go be/internal/handlers/plans.go be/cmd/api/main.go
git commit -m "feat: publish card_status to GlobalTopic on every stage/status change"
```

---

### Task 3: New global `GET /stream` route

**Files:**
- Modify: `be/internal/handlers/stream.go`

**Interfaces:**
- Consumes: `stream.GlobalTopic` from Task 1, `h.Hub` (already present on `StreamHandler`).
- Produces: `GET /api/stream` (SSE) — later (frontend) tasks connect an `EventSource` to this exact path.

- [ ] **Step 1: Add the `streamAll` handler and register its route**

Replace:

```go
func (h *StreamHandler) Routes(r chi.Router) {
	r.Get("/cards/{id}/stream", h.stream)
}
```

with:

```go
func (h *StreamHandler) Routes(r chi.Router) {
	r.Get("/cards/{id}/stream", h.stream)
	r.Get("/stream", h.streamAll)
}
```

Add this new method (place it after the existing `stream` method, same file):

```go
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
```

- [ ] **Step 2: Verify**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be && go build ./... && go vet ./...
```

Expected: both clean. This task cannot be fully verified statically — a live check (does `GET /api/stream` actually respond with `text/event-stream` and deliver a `card_status` event) is deferred to Task 6, once the frontend side also exists to trigger and observe one end-to-end. If you have a running backend available now, you can spot-check early with:

```bash
curl -N http://localhost:8081/api/stream
```

Expected: the connection hangs open (no immediate close/error) — confirms the route exists and doesn't 404/500 on connect. Full event delivery is verified in Task 6.

- [ ] **Step 3: Commit**

```bash
git add be/internal/handlers/stream.go
git commit -m "feat: add GET /stream global SSE route"
```

---

### Task 4: Frontend — SSE data layer + `ActiveCardsRail` component (combined)

Kept as one task rather than split: a version that only adds `AppShell`'s
`cards` state without rendering it anywhere would fail `tsc` under this
repo's `noUnusedLocals` (`cards` itself would be declared-but-unread, only
`setCards` used) — an artificial broken intermediate commit. Data layer and
its one consumer land together.

**Files:**
- Modify: `fe/src/lib/types.ts`
- Modify: `fe/src/lib/api.ts`
- Modify: `fe/src/components/AppShell.tsx`
- Create: `fe/src/components/ActiveCardsRail.tsx`

**Interfaces:**
- Consumes: `GET /api/stream` from Task 3 (backend must be running for this task's manual check to show real events; `tsc` alone confirms only that the code compiles); `STATUS_META` from `fe/src/lib/statusMeta.ts` (existing, exports `Record<RunStatus, { icon: LucideIcon; badge: string; bar: string; label: string }>`).
- Produces: `AppShell` holds `cards: Card[]` state, refetched on mount and on every `card_status` SSE event — Task 5 (header pill) reads this same `cards` state directly from `AppShell`'s own scope. Default export `ActiveCardsRail({ cards: Card[] })`.

- [ ] **Step 1: `types.ts` — extend `StreamEvent`**

Replace:

```ts
export type StreamEvent = {
  type: 'log' | 'log_delta' | 'diff' | 'stage' | 'done' | 'error' | 'chat' | 'chat_delta' | 'chat_done' | 'task'
  stage?: string
  line?: string
  file?: string
  diff?: string
  data?: string
}
```

with:

```ts
export type StreamEvent = {
  type:
    | 'log'
    | 'log_delta'
    | 'diff'
    | 'stage'
    | 'done'
    | 'error'
    | 'chat'
    | 'chat_delta'
    | 'chat_done'
    | 'task'
    | 'card_status'
  stage?: string
  line?: string
  file?: string
  diff?: string
  data?: string
  cardId?: string
}
```

- [ ] **Step 2: `api.ts` — add `streamAllUrl`**

Replace:

```ts
  streamUrl: (cardId: string) => `${API_BASE}/cards/${cardId}/stream`,
```

with:

```ts
  streamUrl: (cardId: string) => `${API_BASE}/cards/${cardId}/stream`,
  streamAllUrl: () => `${API_BASE}/stream`,
```

- [ ] **Step 3: Create `fe/src/components/ActiveCardsRail.tsx`**

```tsx
import { Link } from 'react-router-dom'
import { STATUS_META } from '@/lib/statusMeta'
import type { Card } from '@/lib/types'

const MAX_ROWS = 6

// Compact, always-visible list of the app's cards in the persistent
// sidebar — running cards first, then most-recently-updated. Capped so a
// long-lived install with dozens of old cards doesn't fill the rail
// forever; the rest are one click away on Board.
export default function ActiveCardsRail({ cards }: { cards: Card[] }) {
  if (cards.length === 0) return null

  const sorted = [...cards].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (b.status === 'running' && a.status !== 'running') return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
  const visible = sorted.slice(0, MAX_ROWS)
  const remaining = sorted.length - visible.length

  return (
    <div className="px-3 mt-6 space-y-1">
      <div className="flex items-center gap-2 px-3 mb-2">
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Active</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      {visible.map((card) => {
        const meta = STATUS_META[card.status] ?? STATUS_META.idle
        const Icon = meta.icon
        return (
          <Link
            key={card.id}
            to={`/cards/${card.id}`}
            className="focus-ring flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors min-w-0"
          >
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{card.title}</span>
          </Link>
        )
      })}
      {remaining > 0 && (
        <Link
          to="/"
          className="focus-ring block px-3 py-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          {remaining} more on Board →
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire card-list state, the SSE subscription, and `ActiveCardsRail` into `AppShell.tsx`**

Update the imports at the top of `fe/src/components/AppShell.tsx` — replace:

```tsx
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cpu, FileText, FlaskConical, Terminal, Workflow } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
```

with:

```tsx
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Cpu, FileText, FlaskConical, Terminal, Workflow } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'
import ActiveCardsRail from '@/components/ActiveCardsRail'
import { api } from '@/lib/api'
import type { Card, StreamEvent } from '@/lib/types'
```

Inside the component, right after `const location = useLocation()`, add:

```tsx
  const [cards, setCards] = useState<Card[]>([])

  useEffect(() => {
    api.listCards().then(setCards).catch(() => {})
  }, [])

  useEffect(() => {
    const es = new EventSource(api.streamAllUrl())
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data) as StreamEvent
      if (ev.type !== 'card_status') return
      api.listCards().then(setCards).catch(() => {})
    }
    return () => es.close()
  }, [])
```

Then replace:

```tsx
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map(({ label, icon: Icon, to }) => {
            const active = to === location.pathname
            return (
              <Link key={label} to={to} className="focus-ring block rounded-sm">
                <span
                  className={`flex items-center gap-3 px-3 py-2.5 text-[10px] font-mono uppercase tracking-wide rounded-sm transition-colors duration-(--dur-short) ease-(--ease-out) ${
                    active
                      ? 'bg-secondary text-secondary-foreground border-l-4 border-primary'
                      : 'text-muted-foreground hover:bg-secondary/50 cursor-pointer'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>
      </aside>
```

with:

```tsx
        <nav className="space-y-1 px-3">
          {NAV_ITEMS.map(({ label, icon: Icon, to }) => {
            const active = to === location.pathname
            return (
              <Link key={label} to={to} className="focus-ring block rounded-sm">
                <span
                  className={`flex items-center gap-3 px-3 py-2.5 text-[10px] font-mono uppercase tracking-wide rounded-sm transition-colors duration-(--dur-short) ease-(--ease-out) ${
                    active
                      ? 'bg-secondary text-secondary-foreground border-l-4 border-primary'
                      : 'text-muted-foreground hover:bg-secondary/50 cursor-pointer'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </span>
              </Link>
            )
          })}
        </nav>
        <div className="flex-1 overflow-y-auto">
          <ActiveCardsRail cards={cards} />
        </div>
      </aside>
```

Note `flex-1` moves from `<nav>` to the new wrapping `<div>` around `ActiveCardsRail` — `<nav>` no longer needs to grow to fill the sidebar since the rail (inside its own scrollable, growing container) now does that job, and a long card list should scroll independently rather than pushing the nav links around.

- [ ] **Step 5: Verify**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/fe && npx tsc -b --noEmit
```

Expected: clean.

If a backend is running (`cd be && go run ./cmd/api`) and a frontend dev server is running (`cd fe && npm run dev`): check the Network tab for a `stream` request with type `eventsource`, confirming the connection opens (Task 3's route). Open any page, confirm the sidebar shows nothing extra when there are zero cards, and shows a card list (with status icons matching Board's icons) once at least one card exists. Confirm clicking a row navigates to that card's `CardDetail` page. Confirm creating more than 6 cards shows the "N more on Board" link and it navigates to `/`. Full live-update (SSE event → rail refresh) verification happens in Task 6.

- [ ] **Step 6: Commit**

```bash
git add fe/src/lib/types.ts fe/src/lib/api.ts fe/src/components/AppShell.tsx fe/src/components/ActiveCardsRail.tsx
git commit -m "feat: add live Active Cards rail to the sidebar"
```

---

### Task 5: Header running-count pill

**Files:**
- Modify: `fe/src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `cards: Card[]` from `AppShell`'s own state (Task 4) — no new prop, this is derived inline in the same component.

- [ ] **Step 1: Add the derived count and the pill**

In `fe/src/components/AppShell.tsx`, add this derived value alongside the existing `const location = useLocation()` (anywhere after `cards` state is declared, before the `return`):

```tsx
  const runningCount = cards.filter((c) => c.status === 'running').length
```

Replace the header's right-hand side:

```tsx
          <ThemeToggle />
        </header>
```

with:

```tsx
          <div className="flex items-center gap-3">
            {runningCount > 0 && (
              <span className="text-[10px] font-mono uppercase tracking-wide px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary">
                {runningCount} running
              </span>
            )}
            <ThemeToggle />
          </div>
        </header>
```

- [ ] **Step 2: Verify**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/fe && npx tsc -b --noEmit
```

Expected: clean.

If a dev server is running: confirm the pill doesn't render with 0 running cards, confirm it shows the correct count and updates live when a card starts/stops running (start a build on one card, watch the header update without a page refresh).

- [ ] **Step 3: Commit**

```bash
git add fe/src/components/AppShell.tsx
git commit -m "feat: add running-count pill to the header"
```

---

### Task 6: Full manual verification pass (real backend + frontend run)

**Files:** none — verification only. This task exists because Tasks 3, 4, and 5 each deferred a piece of live verification to "once the full picture exists" — this is that point.

- [ ] **Step 1: Static checks, full range**

```bash
cd /Users/muhammadmuntasir/Agam/devpipe/be && go build ./... && go vet ./... && go test ./...
cd /Users/muhammadmuntasir/Agam/devpipe/fe && npx tsc -b --noEmit
```

Expected: all clean.

- [ ] **Step 2: Start a real backend + frontend**

```bash
# Terminal 1
cd /Users/muhammadmuntasir/Agam/devpipe/be && go run ./cmd/api

# Terminal 2
cd /Users/muhammadmuntasir/Agam/devpipe/fe && npm run dev
```

Confirm the backend starts without error (Postgres must be reachable at the configured `DATABASE_URL`, or the default `postgres://devpipe:devpipe@localhost:5432/devpipe?sslmode=disable`).

- [ ] **Step 3: Confirm the global stream connects**

```bash
curl -N http://localhost:8081/api/stream
```

Expected: the connection stays open (no immediate error/close). Leave it running in a spare terminal — you'll watch it during the next steps to see raw `card_status` events arrive.

- [ ] **Step 4: Walk the live behavior**

In the browser (`http://localhost:5174`):

- With zero cards: confirm the sidebar shows only the 5 nav links, no "Active" section, no running-count pill.
- Create a card. Confirm it appears in the sidebar's Active Cards rail within moments (driven by the `card_status` event fired on card creation's implicit stage — note: card *creation* itself doesn't call `UpdateStage`, so the rail's live-update won't fire until the card's stage actually changes; the initial appearance comes from the mount-time `listCards()` fetch in Task 4, not from SSE — confirm this distinction holds: does the rail show a brand-new card immediately, or only after its first real stage transition? If it doesn't show immediately, that's expected per this architecture, not a bug — note it in your report either way).
- Advance the card (generate + approve a plan, start a build). Confirm: the `curl -N` terminal from Step 3 shows a raw `card_status` event; the sidebar's rail updates the card's status icon live, without a page refresh; the header's running-count pill appears/updates while the build runs and disappears when it finishes.
- Navigate between pages (Board → Agents → Logs). Confirm the rail and pill persist correctly across navigation (even though `AppShell` remounts each time per the Global Constraints note, the `EventSource` reconnects fast enough that this should be seamless — confirm there's no visible flicker or stale-data flash worth fixing; if there is, note it, but per the spec this is accepted as-is for this plan).
- Confirm clicking a rail row navigates to the correct `CardDetail` page.
- Create more than 6 cards (or fake it by checking the `MAX_ROWS` cap logic reads correctly at 6). Confirm the "N more on Board" link appears and works.

- [ ] **Step 5: Report**

Summarize what was confirmed working and what (if anything) didn't match expectations from Step 4's flagged distinctions — this task's job is to surface reality, not to force everything into "works as designed."

No commit for this task (verification only, no code changes).

---

## Self-Review

**Spec coverage:** Backend `GlobalTopic`/`Event.CardID` (Task 1) ✓, all 7 `UpdateStage` call sites publishing (Task 2) ✓, new `GET /stream` route (Task 3) ✓, `CardHandler.Hub` wiring (Task 2, Step 4) ✓, FE `streamAllUrl`/`StreamEvent` update + `AppShell` SSE subscription + card-list state + `ActiveCardsRail` component with the 6-row cap + overflow link + `STATUS_META` reuse, all combined to avoid a broken intermediate `tsc` state (Task 4) ✓, header running-count pill (Task 5) ✓, real end-to-end verification given this plan's unique backend-behavior risk (Task 6) ✓, explicit non-goals (pill audit, nav shape, chat bar, `CardDetail.tsx`) — no tasks touch them ✓, the `AppShell`-remounts-per-navigation correction from the spec is called out in Global Constraints and re-verified in Task 6 ✓.

**Placeholder scan:** no TBD/TODO; every step has complete code (full before/after blocks, not descriptions); Task 6's steps are concrete commands and specific things to look at, not "test thoroughly."

**Type consistency:** `stream.Event.CardID` (Task 1) is used with that exact field name at all 7 publish call sites (Task 2) and in the new route (Task 3, via the existing generic `Hub` methods — no direct field access needed there). `stream.GlobalTopic` (Task 1) is used identically in Task 2 (7 publish calls) and Task 3 (`Subscribe`/`Unsubscribe`). `StreamEvent.cardId`/`type: 'card_status'` (Task 4, FE) matches the JSON tags on `stream.Event` (Task 1, BE) exactly (`cardId`, `card_status`). `ActiveCardsRail`'s `{ cards: Card[] }` prop (Task 4) matches the `cards` state's type declared in the same task's `AppShell` changes (`useState<Card[]>`). `STATUS_META[card.status]` (Task 4) matches the existing exported shape in `fe/src/lib/statusMeta.ts` (`Record<RunStatus, { icon, badge, bar, label }>`), consistent with how `Board.tsx` already uses it. `runningCount` (Task 5) derives from the same `cards` state Task 4 declared — no new prop, no interface mismatch possible.
