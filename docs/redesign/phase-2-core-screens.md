# Phase 2 — Core Screens

Goal: rebuild the primary user-facing screens on top of Phase 1 primitives.
This is the biggest phase — split into sub-PRs per screen if needed.

## Depends on
Phase 1 (`AppShell`, `StatusDot`, `CommandPalette`, `Panel`).

## Tasks

### 2.1 — Sidebar: card/session list (replaces `ActiveCardsRail.tsx`)
- Rewrite as tree: repo → branch/card, matching spec §20 IA (`PROJECTS` /
  `AGENTS` / `TERMINALS` grouping concept, adapted to devpipe's actual domain:
  group by `repoPath`, then list `Card`s with `StatusDot` + `stage` label).
- Each row: status dot, card title, branch name (mono font), stage badge.
- Click → navigate to `CardDetail`; keep existing routing in `Board.tsx`/router,
  don't invent new URL scheme.
- Search/filter input at top of sidebar (filters by title/branch, client-side).

### 2.2 — Tab strip wiring
- Feed `AppShell`'s tab strip from open `CardDetail` sessions (one tab per
  open card, closable). Persist open-tabs list to `lib/settings.ts` so reload
  restores tabs (spec §45 session persistence, scoped to UI state only —
  no process reconnection since this is a web app, not local agent processes).

### 2.3 — Stage timeline / chat view (rewrite `CardChatSidebar.tsx` + `ChatStep.tsx`)
- Rename conceptually to "session timeline" per spec §21 layout:
  header (agent, branch, `StatusDot`) → scrollable message list → composer.
- Message list must render, per existing `chatFormat.ts` output: user turns,
  agent turns, tool-call blocks (visually distinct panel, mono font, collapsible
  for long output) — do not flatten tool calls into plain text.
- Composer: textarea (`components/ui/textarea.tsx`) + send button, disabled
  while `card.status === 'running'`.
- Keep `PlanStep.tsx`/`BuildStep.tsx`/`AcceptStep.tsx` stage-specific rendering
  logic, just restyle to new tokens/Panel — these already encode real stage
  semantics (`Stage` union: prd/plan/approved/building/simulating/testing/docs/deployed),
  don't collapse them into one generic component.

### 2.4 — Diff review surface
- New `components/DiffView.tsx` + route/tab within `CardDetail`.
- File list (left, narrow) + diff content (right), unified or side-by-side
  toggle. Check `be`/`be-rust` for existing diff endpoint before building —
  if none exists, flag for Phase 5, stub UI behind a feature check rather than
  building against a fake shape.
- Actions per spec §23 scoped to what devpipe's backend actually supports:
  confirm with `lib/api.ts` which of {commit, push, create PR, revert file,
  discard} are real endpoints before adding buttons for them.

### 2.5 — Git action bar (replaces/extends `StageActionBar.tsx`)
- Single smart primary action driven by card/branch git state (spec §24):
  dirty→Commit, committed→Push, pushed→Create PR, PR-open→Review, approved→Merge.
- Existing `StageActionBar.tsx` already drives stage transitions (`prd→plan→...`)
  — this is a *separate* concern (git state vs. pipeline stage). Don't conflate;
  git action bar lives inside `DiffView`/`CardDetail`, stage action bar stays
  driving the `Stage` pipeline.

## Acceptance criteria
- Sidebar lists real cards from `lib/api.ts`, filterable, correct status dots.
- Tabs open/close/persist correctly across reload.
- Timeline renders full chat history for an existing card without truncation
  or losing tool-call formatting.
- Diff view only ships actions backed by real API endpoints (verify against
  `be`/`be-rust` routes — no dead buttons).

## Manual test checklist
- [ ] Open 3+ cards as tabs, reload page, tabs restored.
- [ ] Sidebar filter narrows list correctly, clears correctly.
- [ ] Send a chat message on a card in `idle` status, composer disables while `running`.
- [ ] Diff view renders a real card's changes (or shows explicit "not available" state, not a crash).
