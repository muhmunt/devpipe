# devpipe Web Redesign — super.engineering-inspired UI

> **SUPERSEDED**: user decided on a full rewrite including backend (Go → Rust,
> new entity model, new flows) — see `rust-rewrite/README.md` for the current
> plan. This file's design-system work (tokens, `StatusDot`, `AppShell`,
> command palette, theming, responsive rules from phase-0..4) is still reused
> by the new plan's phase-r5; the rest (data layer, `Card`/`Stage` model,
> phase-5/6/7 backend tasks assuming Go) is replaced.

Goal (original scope, frontend-only redesign against existing Go backend):
rewrite `fe/` (Vite + React 19 + Tailwind v4) UI from scratch, replacing current
card-pipeline visual design with a dense, keyboard-first, command-center UI inspired by
super.engineering / Superconductor (see `super_engineering_reference_spec.md` shared in
chat — not copied verbatim, adapted as a **responsive website**, not a native macOS app).

No multi-agent orchestration tooling used to build this — sequential manual phases,
executed and reviewed one at a time.

## Current state (baseline, audited 2026-08-10)

`fe/src/`
- `pages/`: `Board.tsx`, `CardDetail.tsx`, `AgentsPage.tsx`, `DocsPage.tsx`, `LogsPage.tsx`, `Onboarding.tsx`, `SimulatePage.tsx`
- `components/`: `AppShell.tsx`, `ActiveCardsRail.tsx`, `CardChatSidebar.tsx`, `ChatStep.tsx`, `PlanStep.tsx`, `BuildStep.tsx`, `AcceptStep.tsx`, `DraftSwitcher.tsx`, `StageActionBar.tsx`, `RepoPathField.tsx`, `MermaidDiagram.tsx`, `ThemeToggle.tsx`
- `components/ui/`: shadcn primitives (accordion, badge, button, card, dialog, progress, select, sheet, tabs, textarea)
- `lib/`: `api.ts`, `chatFormat.ts`, `settings.ts`, `statusMeta.ts`, `theme.ts`, `types.ts`, `utils.ts`
- Domain model: **Cards** move through stages (Chat → Plan → Build → Accept), each card has a chat sidebar, an active-cards rail, docs/logs/agents pages.

Mental-model mapping to spec vocabulary:
- Card ≈ Task/Task-worktree
- Stage (Chat/Plan/Build/Accept) ≈ Agent execution state machine (§57)
- ActiveCardsRail ≈ Sidebar session list (§20)
- CardChatSidebar ≈ Chat view (§11, §21)

## Phase index

| Phase | File | Focus |
|---|---|---|
| 0 | `phase-0-audit-teardown.md` | Audit, token teardown, design-system foundation |
| 1 | `phase-1-design-primitives.md` | Core primitives: status dots, shell, command palette |
| 2 | `phase-2-core-screens.md` | Sidebar, tabs, chat/timeline, diff review, git action bar |
| 3 | `phase-3-session-chrome.md` | Agent status metadata, notifications, files/changes panel |
| 4 | `phase-4-polish-responsive.md` | Theming, responsive/PIP adaptation, performance |
| 5 | `phase-5-backend-wiring.md` | Confirm/extend `be`/`be-rust` API contract for new UI |
| 6 | `phase-6-missing-flows.md` | Terminal, editor handoff, scripts, custom commands, recovery/needs-input/archive flows (found in re-audit) |
| 7 | `phase-7-board-observability-security.md` | Board.tsx redesign, observability dashboard, security hardening (found in 3rd audit pass) |

Each phase file has: goals, out-of-scope, concrete task list with target files,
acceptance criteria, and a manual test checklist. Execute in order; each phase ships
as its own PR/commit reviewed before moving to the next.

See `gap-audit.md` for the section-by-section cross-check against
`super_engineering_reference_spec.md` that produced Phase 6 — every one of the
spec's 93 sections is marked covered, explicitly deferred (with reason), or
scheduled.
