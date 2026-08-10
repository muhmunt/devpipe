# Phase 6 — Missing Flows (found in gap-audit.md)

Goal: close the real feature/flow gaps found on re-audit against the reference
spec. Run after Phase 5 (needs backend contract work too — several tasks here
have their own backend sub-tasks, don't wait for a separate "Phase 7").

## 6.1 — Terminal surface (spec §10-12)
Decision required before building: devpipe agents currently run **server-side**
(`be/internal/agent`), not as a local PTY child process of the browser — a
browser cannot open a native PTY. Two real options:
- **(a) Server-streamed pseudo-terminal**: backend runs the agent in a real PTY
  server-side, streams raw output over the existing `stream.Hub` SSE channel
  as a new event type (`terminal.output`), frontend renders with a terminal
  emulator lib (e.g. `xterm.js` — not currently installed, would be a new dep).
  Read-only by default (agents aren't interactively steered via keystrokes in
  devpipe's model); revisit two-way input only if a real use case appears.
- **(b) Raw log viewer**: reuse existing `LogsPage.tsx`/run artifacts
  (`be/internal/db/runs.go`, `artifacts.go`) — render captured stdout/stderr
  per run in a mono-font scrollback panel styled like a terminal, no live PTY.
Recommendation: **(b) first** — matches what the backend already captures
(`RunStore`/`ArtifactStore`), no new dependency, ships in this phase. Flag (a)
as a future upgrade only if users need to watch truly live agent output beyond
what SSE chat events already provide.
- Task: new `components/TerminalView.tsx` tab inside `CardDetail`, sourced
  from `RunHandler` artifact/log data via `lib/api.ts`.

## 6.2 — Workspace entity (spec §6.2, §18)
- Backend: new `workspaces` concept is a large change (new table, migration,
  every `Card` gains `workspaceId`) — do NOT build unless multi-repo grouping
  is an actual near-term need. Cheaper interim step matching current data:
  group sidebar (already built in phase-2.1) by **distinct `repoPath` values**
  present across existing cards — gives the visual grouping benefit without a
  new entity/migration. Only build a real `Workspace` table if/when devpipe
  needs named, persistent groupings (e.g. saved workspace name/icon/color
  independent of which repos happen to have cards). Document this as the
  chosen interim scope; revisit if requirements grow.

## 6.3 — Editor handoff (spec §25)
- Frontend only: add "Open in Editor" action in `CardDetail` header (next to
  git action bar). Uses `card.worktreePath`.
- Web apps can't shell out directly — needs a backend endpoint:
  `POST /api/cards/:id/open-editor` with body `{"editor": "vscode"|"cursor"|"zed"}`,
  backend runs `code <path>` / `cursor <path>` / `zed <path>` (whichever CLI is
  on PATH server-side — only if devpipe's backend runs on the same machine as
  the user's editor; **if devpipe backend is ever deployed remotely this
  feature is not applicable** — confirm deployment model before building,
  since local-only dev usage is the only case where this makes sense).
- If backend is remote-only: skip this feature, document as N/A rather than
  building a broken button.

## 6.4 — Workspace scripts: setup/run/test/teardown (spec §26)
- Add optional fields to repo-level config (new `be/internal/db` table
  `repo_scripts` keyed by `repoPath`, or a `devpipe.yaml`/`.json` file checked
  into the target repo itself — file-based is simpler, matches spec's "store
  in repository so teams can share" recommendation).
- Frontend: `components/RepoScriptsPanel.tsx` — buttons for each defined
  script, runs via existing `BuildHandler`/`RunHandler` execution path (reuse
  run/artifact infra from 6.1, don't build a second execution pipeline).
- Only ship if a script is actually defined for the repo — no empty
  setup/run/test/teardown buttons shown when nothing configured.

## 6.5 — Custom commands (spec §27)
- Composer (phase-2.3) gets a `/` command menu: typing `/` in the chat input
  shows matching commands, selecting one inserts/sends its template prompt.
- Storage: start with a small hardcoded global set (`/review`, `/explain`,
  `/commit`) shipped in frontend config (`lib/commands.ts`), no backend needed
  for v1. Only build backend-persisted custom commands (workspace/project
  scoped, per spec's scope levels) if hardcoded set proves insufficient —
  avoid building a full CRUD command-management system speculatively.

## 6.6 — Full keybind set (spec §29, patches phase-1.3)
Add to `AppShell.tsx` global key handler, each bound to a real existing action:
- `⌘P` — quick card search (reuses command palette's search mode, not a
  separate UI)
- `⌘N` — new card (existing creation entry point)
- `⌘T` — new terminal/log tab (once 6.1 ships)
- `⌘W` — close active tab
- `⌘Enter` — send message in composer (when composer focused)
- `⌘1..9` — switch to Nth open tab
Do not bind a shortcut to a feature that doesn't exist yet (no `⌘Shift P` PIP
binding — PIP is cut per phase-4.2).

## 6.7 — Failed-agent recovery flow (spec §46, §62, patches phase-3)
When `card.status === 'failed'`:
- Status row (phase-3.1) shows exit info if available from run artifacts.
- Action row: **Restart** (re-trigger same stage via existing `BuildHandler`
  trigger endpoint), **View logs** (opens 6.1's log/terminal view), **Delete
  worktree** (needs backend endpoint — check if `be/internal/worktree` already
  exposes a delete op before adding one).
- This is a UI wiring task once 6.1 exists; no new state beyond existing
  `RunStatus.failed`.

## 6.8 — Needs-input answer flow (spec §61, patches phase-3.2)
`blocked` status today only triggers a notification (phase-3.2). Add the
actual resolution loop:
- Blocked card's timeline (phase-2.3) shows the agent's question as a
  distinct highlighted message (not just plain chat bubble).
- Composer auto-focuses when a card transitions into `blocked` while its tab
  is open.
- Sending a reply while `blocked` calls existing chat-send endpoint (same as
  running state) — confirm backend already resumes the agent run on new chat
  input for a blocked card (check `ChatHandler`/`BuildHandler` — if it
  doesn't distinguish "new instruction" vs "answer to blocked question",
  no frontend change needed beyond the composer auto-focus/highlight).

## 6.9 — Per-session launch config: model/reasoning picker (spec §59)
Current `Onboarding.tsx` only sets a *default* agent once, globally. Real gap:
no per-card choice of agent/model/reasoning at creation time.
- Find card-creation entry point in `Board.tsx`, add a small inline config
  step: agent (claude/cursor, from `AgentAvailability`), model (if backend
  adapter supports selecting one — check `be/internal/agent/adapter.go` for
  whether model is currently hardcoded or configurable before adding a picker
  for a dimension the backend ignores).
- Only expose "reasoning level" control if the underlying CLI adapter actually
  accepts one (Claude Code does via `--reasoning`-equivalent flags; Cursor's
  agent CLI may not — verify per adapter, don't show a control that's a no-op).

## 6.10 — Merge completion cleanup + archive (spec §63-65, patches phase-2.5)
- After a card's git action bar reaches "merged": trigger worktree removal
  (backend endpoint, check `be/internal/worktree` for existing remove/cleanup
  function) and move card into an **Archived** view.
- Archive is a filter/tab on the Board (`Stage` already ends at `deployed` or
  `failed` — archiving is a *view* concern: hide archived cards from active
  Board by default, list them under a new `?archived=true` filter or a
  dedicated `/archive` route), not a new backend status enum — reuse existing
  `deployed`/`failed` terminal stages as the "archivable" set, add a
  boolean-ish `archivedAt` timestamp column only if hiding-by-stage isn't
  sufficient in practice.

## Acceptance criteria (whole phase)
- Every gap listed in `gap-audit.md`'s "Real gaps" table has either shipped
  code or an explicit documented reason it's deferred (e.g. 6.3's remote-
  deployment check).
- No speculative backend tables/endpoints built without a confirmed consuming
  UI in the same phase.

## Manual test checklist
- [ ] Trigger a failed card, confirm Restart/View logs/Delete worktree all work end-to-end.
- [ ] Trigger a blocked card, reply from composer, confirm agent resumes.
- [ ] Create a new card, confirm agent/model picker only shows controls the backend actually honors.
- [ ] Merge a test card end-to-end, confirm worktree removed and card no longer shows in default Board view.
- [ ] `/review` slash command in composer inserts expected template text.
