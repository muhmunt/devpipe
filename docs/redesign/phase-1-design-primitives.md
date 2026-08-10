# Phase 1 — Design System Primitives

Goal: build reusable primitives the new UI screens (Phase 2+) will compose. No page
rewiring yet beyond swapping `AppShell.tsx` skeleton.

## Depends on
Phase 0 tokens (`--color-*`, `--spacing-*`, `--radius-*`, `--font-*`).

## Tasks

### 1.1 — Status indicator component
New `components/ui/status-dot.tsx`:
- Maps `RunStatus` (`idle | running | success | failed | blocked`) → glyph + color,
  per spec §20:
  - `running` → `●` pulsing, accent color
  - `blocked`/needs-input → `!` warning color
  - `success` → `✓` success color
  - `failed` → `×` error color
  - `idle` → `○` muted
- Add a `thinking` visual variant (`◐`) for streaming/tool-call-in-progress states
  used later in Phase 3 agent metadata — reserve the type now:
  `RunStatus | 'thinking'` union in a new `lib/statusMeta.ts` export
  (`EXTENDED_STATUS_META`) without touching the existing `RunStatus` domain type.
- Replace ad-hoc `STATUS_META.icon` lucide usage in `Board.tsx`/`CardDetail.tsx`
  with this component (keep `STATUS_META` as the color/label source of truth,
  `StatusDot` as the render layer).

### 1.2 — App shell layout primitive
Rewrite `components/AppShell.tsx` as three-region CSS grid:
```
┌─────────┬──────────────────────────────┐
│         │  Top bar (36-44px)           │
│ Sidebar ├──────────────────────────────┤
│ 220-    │  Tab strip (32-36px)         │
│ 280px   ├──────────────────────────────┤
│         │  Content                     │
└─────────┴──────────────────────────────┘
```
- Sidebar collapsible (persist collapsed state to `lib/settings.ts`).
- Top bar: workspace/repo switcher (left), global actions (right) — command
  palette trigger, theme toggle, agent-availability indicator (reuse existing
  `AgentAvailability` type from `lib/types.ts`).
- Tab strip: horizontal scrollable, per-card/session tabs (feeds Phase 2).

### 1.3 — Command palette (⌘K)
New `components/CommandPalette.tsx` using existing `radix-ui` dependency
(`Dialog`/`Command` primitive — check if `cmdk` needs adding; if not present,
add `cmdk` package, it's the standard Radix-adjacent command menu lib).
- Global keybinding `⌘K` / `Ctrl+K` registered in `AppShell.tsx`.
- Initial command set (static, wired to existing routes/actions only):
  - "Go to Board"
  - "Go to Agents"
  - "Go to Docs"
  - "Go to Logs"
  - "New card" (existing creation flow, find entry point in `Board.tsx`)
  - "Toggle theme"
- Design for extensibility (Phase 2/3 add "Open diff", "Create PR", etc.) but
  do not stub unimplemented commands — only ship commands with a real handler.

### 1.4 — Base surface components
- `components/ui/panel.tsx`: bordered surface block (`--color-surface`,
  `--color-border`, `--radius-md`) — replaces raw `Card` shadcn component in
  contexts needing denser padding than the default shadcn Card.
- Keep existing `components/ui/card.tsx` for anything still using shadcn Card
  API directly; don't force a mass rename in this phase.

## Acceptance criteria
- `StatusDot` renders all 5 `RunStatus` values + `thinking` variant correctly
  in isolation (add a quick dev-only `/style-guide` route, remove before Phase 4
  ships, or keep behind a `import.meta.env.DEV` guard).
- `AppShell` grid renders sidebar/topbar/tabstrip/content on all existing pages
  without layout shift.
- ⌘K opens/closes palette from any page; each listed command actually navigates
  or executes.

## Manual test checklist
- [ ] ⌘K on Mac and Ctrl+K on non-Mac keyboard both work.
- [ ] Sidebar collapse/expand persists across reload.
- [ ] StatusDot pulsing animation only runs for `running`/`thinking`, respects
      `prefers-reduced-motion`.
