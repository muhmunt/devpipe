# App shell redesign — toward the Superconductor DNA

Status: approved (design), pending plan
Date: 2026-08-09

## Problem / origin

User asked Hallmark to `study` a reference app ("Superconductor" — a Rust/Metal
desktop app for managing git worktrees + AI coding agents, screenshot-only
source, WebFetch on the real target URL `super.engineering` was blocked by
bot protection throughout, so the screenshot became the actual reference)
and then asked to build devpipe's whole shell toward that extracted DNA.

**Diagnosis summary** (full detail in the conversation, condensed here):
dark cool-neutral paper, small electric-blue accent (~5% footprint), single
sans family for chrome with monospace reserved for code-identifier chips,
three-pane asymmetric layout (side-rail nav with grouped project/branch
list showing live status dots, wide center pane, right file/status panel),
dense technical rhythm. Notable finding: this DNA is *already* close to
devpipe's existing dark theme (Cobalt-anchored, hue ~256, JetBrains Mono
labels) from an earlier Hallmark redesign pass this session — this is a
structural tightening, not a palette rebuild.

## Scope check against current devpipe state

Before designing, checked what's actually different from the reference vs.
already matching:

- **Nav is already a side-rail** (`AppShell.tsx`) — not a top bar. No
  structural nav change needed.
- **Chat bar is already close** — `CardChatSidebar.tsx` (unified in the
  prior CardDetail-flow redesign) already has a header pill (scope
  indicator) + bottom-pinned input, matching the reference's model-selector-
  pill-plus-input pattern. No change needed.
- **Pill/chip visual treatment is already applied everywhere it belongs** —
  audited via `grep -rn "rounded-full"` across every page/component:
  Board, LogsPage, AgentsPage, CardDetail, Onboarding, CardChatSidebar,
  StageActionBar, AcceptStep, BuildStep all already use pill shapes for
  badges/chips. The one non-pill `rounded` hit (`SimulatePage.tsx:66`) is a
  terminal output block, correctly not a pill. **This item needs no work.**
- **The real gap:** Superconductor's rail shows live work items (branches,
  each with a status dot/spinner) directly in the persistent chrome —
  devpipe's equivalent (cards, with `RunStatus`: idle/running/success/
  failed/blocked) only lives on the Board page today. That's the one
  genuine structural distance from the reference.

## What this plan actually builds

1. An **Active Cards rail section** in `AppShell.tsx`'s sidebar, live via
   SSE, so running/recent work is visible from any page — not just Board.
2. A **running-count pill** in the header, fed by the same data.
3. **No changes** to nav shape, chat bar, or pill/chip treatment — already
   done.

## Design

### Backend

- `be/internal/stream/hub.go`: add `CardID string \`json:"cardId,omitempty"\``
  to the `Event` struct (additive — every existing event type leaves it
  empty, no behavior change to per-card streams). Add a package-level
  `const GlobalTopic = "__global__"` — the existing `Hub` type (keyed
  `map[string][]chan Event`) is reused as-is for the global topic via
  `Hub.Subscribe(GlobalTopic)` / `Hub.Publish(GlobalTopic, ev)`. No new
  pub/sub type.
- New event type `"card_status"`, carrying `CardID`, `Stage`, `Data`
  (the new status). Published once, in the handler layer (not inside
  `db.CardStore` — keeps the DB package free of a dependency on `stream`),
  immediately after each of these 7 `CardStore.UpdateStage` call sites
  succeeds:
  - `be/internal/handlers/build.go:76, 124, 281`
  - `be/internal/handlers/cards.go:148, 205`
  - `be/internal/handlers/plans.go:174, 316`
- `CardHandler` (`be/internal/handlers/cards.go`) currently has no `Hub`
  field (`BuildHandler`/`PlanHandler` already do) — add
  `Hub *stream.Hub` and wire it in `be/cmd/api/main.go`'s existing
  `cardHandler := &handlers.CardHandler{...}` construction.
- New route `GET /stream` (global, no card ID) as a second method on the
  existing `StreamHandler` (`be/internal/handlers/stream.go`) — it already
  owns the `Hub`, just add a sibling handler function and register the
  route alongside the existing `/cards/{id}/stream`.

### Frontend

- `fe/src/lib/api.ts`: add `streamAllUrl: () => \`${API_BASE}/stream\`` next
  to the existing `streamUrl`.
- `fe/src/components/AppShell.tsx`: fetch `api.listCards()` once on mount,
  then open one `EventSource` on `streamAllUrl()` for the component's
  lifetime. On any `card_status` event, refetch the full list via
  `api.listCards()` (simpler and correctness-safe vs. patching individual
  cards from the event's partial fields — the list is small, a full
  refetch is cheap and avoids merge-logic bugs).
- New component `fe/src/components/ActiveCardsRail.tsx`: renders the
  polled/streamed card list, sorted running-first then by `updatedAt`
  descending, capped at 6 rows with a "N more on Board" link
  (`to="/"`) when the full list is longer. Each row: status dot (reuses
  `STATUS_META` from `fe/src/lib/statusMeta.ts` — same icon/color as
  everywhere else in the app, not a new color decision), truncated title,
  `Link` to `/cards/:id`. Sits in `AppShell.tsx`'s sidebar below the
  existing 5 nav links, behind a small header label ("Active") and a
  hairline divider — only renders when `cards.length > 0` (no empty-state
  clutter in persistent chrome).
- Header (`AppShell.tsx`'s top bar): a small running-count pill
  (`{n} running`) next to the existing `ThemeToggle`, derived from the same
  polled/streamed list — one data source, two places it's shown. Doesn't
  render when the count is 0.

### Data flow

```
CardStore.UpdateStage succeeds (7 call sites)
  → handler calls Hub.Publish(GlobalTopic, {type: "card_status", cardId, stage, data: status})
  → every AppShell instance's EventSource receives it
  → AppShell calls api.listCards() to refresh
  → ActiveCardsRail + header count-pill both re-render from the refreshed list
```

`AppShell` wraps every page, so the rail and count-pill stay live across
navigation without any individual page needing to know about this.

### Error handling

- `EventSource` connection failures: browsers auto-reconnect `EventSource`
  by default — no custom retry logic needed. A brief gap in live updates
  during a reconnect is acceptable (matches how per-card streams already
  behave).
- Empty card list: rail section doesn't render at all, as noted above.
- Backend: `Hub.Publish` already has documented backpressure handling
  (drops chatty events under load, blocks briefly for terminal ones) —
  `card_status` is infrequent enough (7 call sites, human-paced actions)
  that this doesn't need special-casing.

### Testing

No FE automated test framework, and this plan touches real backend
behavior for the first time in this session's work — `go build`/`tsc`
catch compile errors but cannot confirm the pub/sub fires end-to-end.
Verification is a real manual run, not just static checks:

- Start BE + FE, confirm `GET /stream` connects (check Network tab / a
  manual `curl -N` against the endpoint).
- Create a card, confirm it appears in the rail and the running-count pill
  updates without a page refresh.
- Advance a card's stage (e.g. approve a plan, start a build) from another
  browser tab or via `curl`, confirm the rail updates live in the first
  tab.
- Confirm the rail survives navigating between pages without
  flickering/re-subscribing (the `EventSource` should persist since
  `AppShell` wraps every route and doesn't remount on navigation — confirm
  this is actually true given how routing is set up, not just assumed).
- Confirm clicking a rail row navigates to the right card.
- Confirm the "N more on Board" link appears only when there are more than
  6 cards, and goes to Board.

## Non-goals (explicitly out of scope)

- Pill/chip visual treatment — audited, already complete, no work needed.
- Nav shape change (side-rail already exists).
- Chat bar changes (already close to the reference from the prior redesign).
- Per-card SSE streams (`/cards/:id/stream`) — untouched, this plan adds a
  second, separate global stream alongside it.
- Any change to `CardDetail.tsx` or its stage components — this plan is
  scoped to shared chrome (`AppShell.tsx` + the new rail component) only.

## Open questions (none blocking)

None — backend call sites are enumerated exactly, the `Hub` reuse approach
is confirmed against the existing type, and `CardHandler`'s missing `Hub`
field is a small, well-understood addition matching the pattern already
used by `BuildHandler`/`PlanHandler`.
