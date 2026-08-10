# Phase R5 — Frontend Rebuild From Zero (spec-driven, wired to Rust API)

Goal: `fe/src` was deleted in `phase-r-delete-everything.md` down to a blank
boot stub. This phase builds the entire frontend fresh, directly off
`super_engineering_reference_spec.md` (§18-31, §86-88 for layout/design,
§58-65 for flows) — no reuse of any earlier design-system decision from
`docs/redesign/phase-0..4` (those docs are retired; do not reference them for
token/component choices, re-derive from the spec instead).

## 5.1 — Design system, derived fresh from spec (§30-31)
- Token set direct from §30's list (`color.background/surface/surfaceElevated/
  border/text/textMuted/accent/success/warning/error`, `spacing.xs..xl`,
  `radius.sm..lg`, `font.ui/mono/terminal`) mapped to Tailwind v4 `@theme` in
  a fresh `fe/src/index.css` (old file deleted, this is new content, not an edit).
- Visual principles from §31: dense, dark-mode-first, high information
  density, minimal chrome, no oversized marketing cards, no modal-heavy flows.
- Fonts: Inter (UI) + JetBrains Mono (code/terminal) — reinstall
  `@fontsource-variable/*` packages fresh in the new `package.json` deps (or
  keep them if D.3 preserved `package.json`; confirm which fonts survive that
  decision before assuming).

## 5.2 — Core primitives (§20-22, §29)
- `StatusDot` — `RunStatus`-equivalent from R0's `AgentSession.status` enum
  (`created/starting/running/needs_input/waiting/completed/failed/stopped`),
  mapped to glyphs per §20 (`● ◐ ! ✓ × ○`).
- `AppShell` — 3-region grid (sidebar 220-280px / topbar 36-44px / tabstrip
  32-36px / content), per §18, §87 density table.
- Command palette (⌘K, full shortcut table from §29 — ⌘K/⌘P/⌘N/⌘T/⌘W/⌘Enter/⌘1-9).

## 5.3 — Types + API client, built directly against R0-R4 Rust DTOs
```ts
// fe/src/lib/types.ts — new file, first frontend code written against the new backend
export type Workspace = { id: string; name: string; color: string|null; icon: string|null; ... }
export type Repository = { id: string; workspaceId: string; name: string; localPath: string; ... }
export type Worktree = { id: string; repositoryId: string; path: string; branch: string; kind: 'primary'|'task'; status: 'clean'|'modified'|'conflicted'|'ahead'|'behind'; ... }
export type AgentSession = { id: string; worktreeId: string|null; agentDefinitionId: string; status: 'created'|'starting'|'running'|'needs_input'|'waiting'|'completed'|'failed'|'stopped'; ... }
export type AgentEvent = /* discriminated union matching R4's Rust enum tags */
```
- `fe/src/lib/api.ts` — one function per R0-R4 endpoint, typed against the
  above. No legacy types anywhere in the codebase to avoid conflicting with —
  this is the first version, not a migration.

## 5.4 — Screens, built fresh per spec's screen map (§86)
| Screen | Spec basis | Notes |
|---|---|---|
| `WorkspaceHome.tsx` | §86 "Workspace Home" | Lists workspaces, create/open |
| `RepositoryPage.tsx` | §86 "Repository" | Primary worktree + task worktrees list, per §5, §18 IA |
| `WorktreePage.tsx` | §86 → Agent Chat/Terminal/Diff/Git tabs | Tabs: Timeline (§21, session events), Diff (§23, R2), Files, Git action bar (§24) |
| `AgentCenter.tsx` | §86 "Agent Center" (Running/Completed/Archived) | Cross-worktree session list, feeds archive flow (§63-65) |
| `Sidebar` (in `AppShell`) | §20 | Projects tree + status dots, per new `Workspace→Repository→Worktree` hierarchy (not the old flat card list) |
| `Onboarding.tsx` | §58 "First Launch" | Detect git/agents/editors, create first workspace |
| `LogsPage.tsx` / terminal view | §10-12 (adapted, see phase-r9.1 decision) | Log/scrollback view sourced from `session_events` `ToolOutput` |
| Global Settings | §86 | Agents, Appearance, Keyboard, Notifications, Privacy, Automation |

No screen is "carried over" from the old app — every one is a new component
built against the new types (5.3) and new design primitives (5.2).

## 5.5 — Flows, built directly against R4's session lifecycle (spec §58-65)
- **First launch** (§58): detect git/agents → create workspace → show primary worktree.
- **Start agent** (§59): pick repository → create/select worktree → pick
  agent + model + reasoning → launch (`POST /api/repositories/:id/worktrees`
  then `POST /api/worktrees/:id/sessions`).
- **Parallel work** (§60): Agent Center / Repository page shows multiple
  concurrent sessions with live status.
- **Needs-input** (§61): timeline highlights `NeedsInput` event, composer
  auto-focuses, reply posts to R4.5's endpoint.
- **Failed agent** (§62): action row (Restart, View logs, Delete worktree).
- **Merge** (§63): git action bar (§24, built against R2's diff/status
  endpoints) drives dirty→commit→push→PR→review→merge, ending in worktree
  removal.
- **Archive** (§64-65): merged/failed sessions move to Agent Center's Archived tab.

## 5.6 — Editor handoff, workspace scripts, custom commands (spec §25-27)
- Editor handoff (§25): `POST /api/worktrees/:id/open-editor` (new `be-rust`
  endpoint, only if backend runs local to the user's machine — confirm
  deployment model first, matches the same conditional call as before).
- Workspace scripts (§26): `repositories` table already has
  `setup_script`/`run_script`/`test_script`/`teardown_script` (R0) —
  `RepoScriptsPanel.tsx` + `POST /api/repositories/:id/run-script` via R3's
  `ProcessManager`.
- Custom commands (§27): `commands` table (R0) — `/` menu in composer,
  `GET /api/commands?scope=...`.

## Acceptance criteria
- `fe/src` contains no reference to any pre-rewrite concept (`Card`, `Stage`,
  `PRD`, `RunStatus` as previously defined) — this is trivially true since
  those files don't exist anymore post-deletion, but verify no stray import
  survived the deletion (`grep -rn "Card\b\|PRD\b" fe/src` clean, excluding
  new unrelated identifiers).
- Every screen in 5.4's table exists and is wired to real R0-R4 endpoints —
  no screen ships against a mocked/stubbed API response.
- Full first-launch → create workspace → launch session → complete → merge
  flow works end-to-end through the UI.

## Manual test checklist
- [ ] Fresh `npm install && npm run dev` on the post-deletion `fe/` boots to Onboarding, not a blank/broken page.
- [ ] Full flow: onboarding → workspace → repository → worktree → launch Claude session → live timeline → diff → merge → archived.
- [ ] Needs-input flow end-to-end through UI (not just API).
- [ ] Failed session shows Restart/Logs/Delete actions, each works.
- [ ] ⌘K palette and full keybind table (§29) all functional.
