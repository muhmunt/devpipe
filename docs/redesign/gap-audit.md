# Gap Audit — reference spec vs. phase-0..5 plan

Re-audit date: 2026-08-10. Method: walked all 93 sections of
`super_engineering_reference_spec.md` against `phase-0` through `phase-5` docs
and current `fe/src` code. Sections not listed below were confirmed N/A
(native-macOS-only, enterprise/team, cloud, or already covered).

## Covered
- §11/§21 Chat/timeline view — phase-2.3
- §20 Sidebar IA — phase-2.1
- §22 Agent status UX — phase-3.1 (partial, real-fields-only)
- §23 Diff review — phase-2.4 / phase-5.1
- §24 Git workflow smart action — phase-2.5 / phase-5.2
- §28 Notifications — phase-3.2
- §29 (partial) Command palette ⌘K — phase-1.3
- §30 Theme tokens — phase-0.3, phase-4.1
- §38 Agent discovery — already exists (`Onboarding.tsx`, `AgentsPage.tsx`)
- §44/§82 Performance — phase-4.3/4.4
- §45 UI-state session persistence (tabs) — phase-2.2 (scoped to UI state only, documented)
- §81 (partial) failure/empty states — phase-2.4, phase-4

## Explicitly out of scope (documented, not silently dropped)
- §15-16 Agent teams / coordination state — advanced, not MVP for a 2-agent (claude/cursor) web tool.
- §17 Automated review loop with stop conditions — devpipe's stage pipeline is human-driven, not automated multi-round.
- §19 Picture-in-picture — no native-window equivalent on web; phase-4.2 documents this cut explicitly.
- §31-35, §71-74 Local-first native storage (SQLite/Keychain/local API) — devpipe is client/server (Postgres + Go API) by existing architecture; intentional divergence, not a gap.
- §39-41 Custom CLI agent config, local Unix-socket API, standalone CLI — devpipe already is a hosted web app; no local API/CLI surface to build.
- §48-51, §55, §66, §83 Permissions model, team/enterprise policy, task dependency graph, analytics — future/advanced, not MVP.

## Real gaps — added to plan (see phase-6-missing-flows.md + patches below)
| Spec § | Feature | Where added |
|---|---|---|
| §10-12 | Terminal surface / unified chat+terminal session | phase-6.1 (decision + scoped build) |
| §6.2, §18 | Workspace entity grouping multiple repos | phase-6.2 |
| §25 | Editor handoff (Open in VS Code/Cursor/Zed) | phase-6.3 |
| §26 | Workspace scripts (setup/run/test/teardown) | phase-6.4 |
| §27 | Custom commands (`/review`, `/security`, ...) | phase-6.5 |
| §29 | Full keybind set beyond ⌘K | phase-6.6 (patches phase-1.3) |
| §46, §62 | Failed-agent recovery flow | phase-6.7 (patches phase-3) |
| §61 | Needs-input answer flow (not just notify) | phase-6.8 (patches phase-3.2) |
| §59 | Per-session model/reasoning picker at launch | phase-6.9 |
| §63-65 | Merge completion cleanup + archive model | phase-6.10 (patches phase-2.5) |

## Patch notes to existing phase files
- **phase-1-design-primitives.md §1.3**: command palette command set was ⌘K-only;
  phase-6.6 adds the full shortcut table, phase-1.3 should link to it instead of
  re-deriving.
- **phase-2-core-screens.md §2.5**: git action bar stopped at "merge" — add a
  post-merge step per phase-6.10 (worktree delete + card archive trigger).
- **phase-3-session-chrome.md §3.2**: notification-only "needs input" — add
  cross-reference to phase-6.8 for the actual answer UX, not just the alert.

## 3rd pass (2026-08-10, re-audit) — additional gaps found
| Spec § | Feature | Where added |
|---|---|---|
| §14, §60, §86 | `Board.tsx` main parallel-overview page redesign — phase-2 only replaced its sidebar, never targeted the Board grid itself | phase-7.1 |
| §43 | Observability dashboard (Agent/Status/Time/Files/Tests table) | phase-7.2 |
| §47 | Security model — secrets never in responses/logs, no shell injection in new endpoints | phase-7.3 |

## Verification note
§13/§42 (event bus / normalized agent events) confirmed already satisfied by
existing `stream.Hub` SSE mechanism (`be/internal/stream`, `handlers/stream.go`)
— no new task needed, phases 2-3 just consume it.

No further gaps found after 3 audit passes. Every one of the 93 spec sections is
now either covered, explicitly deferred with a stated reason, or scheduled in
phase-6 or phase-7.
