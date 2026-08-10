# Gap Audit — 4th pass, against rust-rewrite plan (R-1..R8)

Prior `docs/redesign/gap-audit.md` audited the retired Go-based plan
(phase-0..7). This file re-audits `super_engineering_reference_spec.md`'s 93
sections against the current **rust-rewrite** plan (`phase-r-delete-everything.md`,
`phase-r0` through `phase-r8`) specifically, since that plan has different
scope (full rewrite, not incremental patching).

## Bug found: dangling cross-reference
`phase-r5-frontend-rewrite.md` referenced "phase-r4.4/6.1 decision" for the
terminal surface — `6.1` was the old (now-deleted) Go-plan's file numbering.
Fixed: reference now points to `phase-r9.1`, which restates the decision
fresh within the rust-rewrite plan.

## New gaps found, closed by phase-r9
| Spec § | Feature | Why missed earlier |
|---|---|---|
| §10-12 | Terminal surface decision | Was only referenced via the now-broken cross-link, never actually restated in the rust-rewrite plan |
| §25, §38, §58 | Editor detection (which editors are installed) | R3 only built agent detection (claude/cursor), not editor detection for the §25 editor-handoff feature |
| §39 | Custom CLI agent (first-class, not advanced-tier per spec's own framing) | Earlier audit pass (against the Go-plan) deferred this as "advanced/out of scope" — re-evaluated: schema already supports it (R0's generic `agent_definitions` columns), and spec explicitly frames it as a core feature, not enterprise-tier. Reclassified from deferred to built. |
| §44 | Event bus backpressure/batching | Old phase-4.3 (retired) covered *frontend* batching only; no backend-side batching was ever specified for the Rust event bus |
| §45-46 | Session reconciliation after backend process restart | R1-R4 never addressed in-memory `ProcessManager` state not surviving a `be-rust` restart — sessions could get stuck `running` forever with no backing process |
| §24 | Conflict-resolution UX step in git action bar | R2.3 detected `conflicted` status; R5.5's action-bar flow didn't explicitly route through a resolve-conflicts step |

## Re-confirmed still covered (no change from R0-R8)
§6-9 entity model/adapters, §7 worktree isolation, §11-13 chat/event bus,
§18-23 layout/sidebar/diff, §26-27 scripts/commands, §29 keybinds, §30-31
design tokens, §33 schema, §37 process manager core, §40-41 local API/CLI
(conditional), §42 event protocol, §43 observability, §47 security, §57
session state machine, §58-65 UX flows, §86-88 screen map/design system.

## Re-confirmed still explicitly out of scope (unchanged reasoning)
§15-17 agent teams/coordination/automated review loop, §19 PIP (no native
window on web), §31-35/§71-74 local-first native storage (Postgres kept
intentionally), §48-51 permissions/team/enterprise policy, §55 task
dependency graph, §66/§83 analytics.

## Outcome
After 4 audit passes (2 on the retired Go-plan, 2 on the rust-rewrite plan),
every one of the 93 spec sections is covered, explicitly deferred with a
stated reason, or scheduled — now current as of `phase-r9`.
