# Phase 4 — Polish, Theming, Responsive Adaptation, Performance

Goal: this is a **website**, not a native macOS app — adapt the reference
product's native-only concepts (PIP, layout trees, always-on-top windows)
into responsive web equivalents, then harden perf.

## Depends on
Phase 1–3 complete (all primitives + screens exist).

## Tasks

### 4.1 — Theme system finalize
- `lib/theme.ts` already handles dark/light — extend to `system` (match
  `prefers-color-scheme`, live-update on OS change via `matchMedia` listener).
- Workspace accent color: single accent token override, stored per-workspace
  in `lib/settings.ts` (if devpipe has multi-workspace concept; if not, single
  global accent picker in a settings page — check `AgentsPage.tsx`/settings
  routes for the right home).
- Remove `ThemeToggle.tsx` old implementation if superseded; keep component
  name/API stable for import sites.

### 4.2 — Responsive breakpoints (replaces native PIP/layout-tree, spec §18-19)
Since there's no floating-window concept on web, adapt:
- **Desktop (≥1280px)**: full 3-region shell (sidebar + tabstrip/content + right panel), as built in Phase 1-3.
- **Tablet (768-1279px)**: right panel (Files/Changes/Checks) becomes a slide-over
  sheet (reuse `components/ui/sheet.tsx`, already installed) instead of fixed column.
- **Mobile (<768px)**: single-pane view with a bottom tab switcher (Sidebar /
  Timeline / Diff / Files) — no simultaneous panes. Command palette becomes
  full-screen on mobile.
- No literal "picture-in-picture" — explicitly cut from scope, document as
  "not applicable to web" in this file so it's not silently missing.

### 4.3 — Performance
- Audit chat/timeline rendering: batch streamed message deltas (if
  `lib/api.ts` polls or streams) — don't re-render full message list per
  chunk; append-only virtualization if history gets long (check if a
  virtualization lib is needed — only add one if profiling shows a real cost
  with realistic history length, don't pre-optimize).
- `MermaidDiagram.tsx`: confirm it doesn't re-render/re-parse on every parent
  re-render (memoize on diagram source string).
- Route-level code splitting: lazy-load `DocsPage`, `LogsPage`, `SimulatePage`
  via `React.lazy` since they're not on the critical first-paint path.
- Verify Tailwind v4 `@theme` build doesn't bloat CSS with unused utility
  classes from the old design (rerun Phase 0 grep, confirm zero hits).

### 4.4 — Accessibility pass
- Keyboard nav: every interactive element in sidebar/tabstrip/palette reachable
  via Tab, visible focus ring using `--color-accent`.
- `prefers-reduced-motion` respected for `StatusDot` pulse and any transitions
  added since Phase 1.
- Color contrast check on new token palette (WCAG AA minimum) for text/background
  pairs, especially status colors on dark background.

## Acceptance criteria
- Manual resize from 1440px → 375px shows no broken layout, no horizontal
  scroll, no inaccessible controls.
- Lighthouse perf score recorded before/after (target: no regression vs.
  Phase 0 baseline, ideally improvement from code-splitting).
- `prefers-reduced-motion: reduce` disables all pulse/transition animation.

## Manual test checklist
- [ ] Resize through all 3 breakpoints, verify sheet/bottom-switcher behavior.
- [ ] Toggle OS dark/light while app on "system" theme — updates live.
- [ ] Throttle network in devtools, confirm lazy-loaded routes show a loading state, not blank screen.
- [ ] Run axe devtools scan, zero critical violations on Board/CardDetail.
