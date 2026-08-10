# Phase 3 — Session/Agent Chrome

Goal: surface richer per-agent status and cross-cutting notifications on top of
Phase 2 screens.

## Depends on
Phase 2 (timeline view, tab strip, sidebar).

## Tasks

### 3.1 — Agent status metadata row
- Add a header strip inside `CardDetail`/timeline view (spec §22):
  status (`StatusDot` + `EXTENDED_STATUS_META` label), current tool (if backend
  exposes it), elapsed time since `card.updatedAt`, model/agent name (`claude`
  or `cursor` from `Card.agent`).
- Only render fields the backend actually provides (`Card` type today has:
  `stage`, `agent`, `status`, timestamps — no tokens/cost/current-file yet).
  Do not fabricate placeholder metrics; ship what's real, leave a documented
  gap list for Phase 5 (tokens, cost, current tool/file need new API fields).

### 3.2 — Notifications
- New `components/NotificationCenter.tsx` — bell icon in top bar (from
  `AppShell`, Phase 1) + dropdown list.
- Trigger conditions from existing `RunStatus` transitions observed via
  polling/websocket in `lib/api.ts` (check current mechanism — polling interval
  vs push): `running→success`, `running→failed`, `running→blocked`.
- Browser-level notification (Notifications API) opt-in toggle in settings,
  respecting `lib/settings.ts` pattern already in place. Must request
  permission explicitly, never auto-request on load.
- Priority mapping per spec §28: `success`→INFO/SUCCESS toast, `failed`→ERROR
  (persist in center until dismissed), `blocked`→ACTION_REQUIRED (persist +
  browser notification if enabled).

### 3.3 — Files/Changes/Checks panel (right sidebar)
Matches the attached screenshot's right column (`Files | Changes 0 | Checks`
tabs + file tree).
- New `components/RightPanel.tsx` with 3 tabs:
  - **Files**: static file tree of `card.repoPath`/`worktreePath` (reuse any
    existing tree logic if present, else new minimal recursive tree component).
  - **Changes**: count + list, sourced from same diff data as `DiffView`
    (Phase 2.4) — do not duplicate fetch logic, share a hook
    (`lib/hooks/useCardDiff.ts`).
  - **Checks**: CI/status checks — only build this tab if `be`/`be-rust` has
    a checks endpoint; otherwise omit tab entirely rather than showing empty
    state permanently (confirm in Phase 5, revisit).
- Panel collapsible, persisted width in `lib/settings.ts`.

## Acceptance criteria
- Status row shows only real fields, no "—" placeholder spam.
- Notification center accumulates events across a session without duplicate
  entries on re-render/poll.
- Right panel Files tab renders actual worktree file tree for a real card.

## Manual test checklist
- [ ] Trigger a card status change (idle→running→success) and confirm exactly
      one notification appears.
- [ ] Dismiss a notification, confirm it doesn't reappear on next poll.
- [ ] Collapse/expand right panel, width persists across reload.
- [ ] Browser notification permission prompt only appears after explicit opt-in click.
