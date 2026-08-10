# Phase 7 — Board Redesign, Observability, Security Hardening

Found on third audit pass: `Board.tsx` itself (the main parallel-tasks overview,
currently a bento grid — see its own header comment: "Hallmark · macrostructure:
Bento Grid") was never explicitly assigned a redesign task. Phase 2 only
replaced `ActiveCardsRail.tsx` (the sidebar), not the central Board page. Also
closes spec §43 (observability) and §47 (security model), neither of which had
a task anywhere in phase-0..6.

## Depends on
Phase 1 (`AppShell`, `StatusDot`, tokens), Phase 2 (sidebar/tabs exist so Board
can link into them), Phase 3 (status metadata fields Board's cards will show).

## 7.1 — Board page redesign (spec §14, §60, §86 "Repository" screen map)
- Rebuild `Board.tsx` grid using Phase 0 tokens + `StatusDot`/`Panel`
  primitives — replace current ad-hoc Tailwind (`bg-card`, `border-border`
  inline classes) with the `--color-surface`/`--radius-md` token set.
- Keep existing real behavior: bento sizing driven by `card.status` (running
  cards get larger span — this is good, keep the *logic*, only restyle),
  `stageProgress()` bar, `relativeTime()` labels, search/filter, new-card
  dialog (`RepoPathField`, agent `Select`).
- Card tile must show: `StatusDot`, title, branch (mono), stage progress bar,
  relative time, agent icon — matches spec §60 parallel-tasks grid intent.
- New-card dialog gets the model/reasoning picker from phase-6.9 wired in
  here (this is the actual creation entry point referenced by that task).

## 7.2 — Observability dashboard (spec §43)
- New tab/route, e.g. `/observability` or a panel on Board — table view:
  `Agent | Status | Time | Files changed | Tests` per spec's example table,
  built from real fields only:
  - `Agent` = `card.agent`
  - `Status` = `card.status` (`StatusDot`)
  - `Time` = elapsed since `card.createdAt`/`updatedAt`
  - `Files changed` = from diff endpoint (phase-5.1) if shipped, else omit column
  - `Tests` = from run artifacts (`RunHandler`) if test results are captured
    there — check `be/internal/db/runs.go`/`artifacts.go` for whether test
    pass/fail counts exist before adding the column; omit if not tracked.
- Do not fabricate tokens/cost columns per spec §43's dollar-cost example —
  devpipe's backend doesn't track this (confirmed absent in Phase 3 audit);
  explicitly excluded, matching phase-3.1's "ship what's real" rule.
- This view is read-only aggregation, no new backend endpoint if
  `GET /api/cards` (existing) already returns enough fields for a session list
  — check before adding a new aggregate endpoint.

## 7.3 — Security hardening pass (spec §47, patches phase-5.2)
- Audit every new endpoint added in phase-5/phase-6 (diff, git-action,
  open-editor, repo-scripts) for:
  - No secret (GitHub token, API key) ever included in a JSON response body.
  - No shell command string containing a secret gets logged (`middleware.Logger`
    in `main.go` logs requests — confirm it doesn't log request bodies verbatim
    for endpoints that might carry tokens; if it does, add body redaction for
    those routes specifically, don't disable logging globally).
  - Repo-scripts (phase-6.4) and open-editor (phase-6.3) endpoints execute
    fixed, non-user-supplied command strings only (`code <path>`, defined
    script from config) — never interpolate raw user input into a shell
    command. Validate `path` params are confined to the card's own
    `worktreePath` (no path traversal).
- Document: devpipe has no OS-keychain equivalent (it's a web backend) — any
  credential (e.g. GitHub token for phase-5.2's create-PR action) must live in
  a server-side env var / secrets manager, never in Postgres in plaintext,
  never sent to frontend. State this explicitly in `be/internal` if a new
  credential is added.

## Acceptance criteria
- Board page visually matches new design-system tokens, all existing
  interactive behavior (filter, new-card dialog, navigation to card detail)
  still works.
- Observability table renders only columns backed by real data; confirmed via
  code review that no placeholder/fabricated metric ships.
- Security checklist (7.3) run against every endpoint added since phase-5,
  zero secret leaks in response bodies or logs, zero shell-injection paths.

## Manual test checklist
- [ ] Board renders correctly with 0 cards, 1 card, 20+ cards (grid reflow).
- [ ] New-card dialog creates a card with chosen agent/model/reasoning, appears correctly in grid.
- [ ] Observability table matches Board's card count and status values exactly.
- [ ] `grep` server logs after exercising git-action/open-editor endpoints — confirm no token/secret substrings present.
