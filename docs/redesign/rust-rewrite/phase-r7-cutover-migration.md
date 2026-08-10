# Phase R7 — Launch Readiness (no migration needed — data was wiped up front)

Superseded content note: this file previously planned a Go→Rust data
migration + phased cutover. Since `phase-r-delete-everything.md` now deletes
`be/` and wipes/backs-up the old database **before** R0-R6 even start, there
is no "old" system running in parallel to migrate from or cut over from by
this point — `be-rust` + the new `fe/` have been the only running app since
early in the rewrite. This phase is now a final readiness check, not a cutover.

## Pre-launch checklist
- [ ] `phase-r-delete-everything.md`'s D.1 backup exists and is stored
      somewhere durable (not just local disk) — the only copy of old data.
- [ ] R0-R6 all pass their own acceptance criteria and manual test checklists.
- [ ] No leftover references anywhere in the repo to the deleted Go backend
      or deleted old frontend code (`grep -rn "package main\|be/internal" .`
      outside `be-rust` returns nothing; `grep -rn "Card\b\|Stage\b\|PRD\b" fe/src`
      returns nothing unless those identifiers were intentionally reused for
      an unrelated new concept — verify by reading, not just grep count).

## Tasks

### 7.1 — CI/deploy config audit
- Remove any CI workflow, `Justfile` target, or `cliff.toml` scope still
  referencing the deleted Go module or deleted frontend paths (should already
  be mostly done in D.5, this is the final check before calling the rewrite done).

### 7.2 — Port/env finalize
- Confirm `be-rust` is bound to the port the deployed frontend actually
  expects, CORS config matches the real frontend origin, `.env`/deploy secrets
  point at the real `devpipe` Postgres instance (not a leftover dev DB name).

### 7.3 — Rename `be-rust/` (optional)
- If desired, rename `be-rust/` → `be/` now that it's the only backend and
  there's no naming collision risk left — purely cosmetic, skip if not worth
  the churn.

## Acceptance criteria
- Full app (fresh `fe/` + `be-rust/`, per R5/R1-R4) runs end-to-end with no
  references anywhere to pre-rewrite code or infrastructure.
- Old data backup (D.1) confirmed retrievable if ever needed, otherwise not
  referenced by any running code path.

## Manual test checklist
- [ ] Full smoke test of every R5 flow against a real deployed `be-rust` instance.
- [ ] `grep -rn "8081\|be/internal\|package main" .` (outside `be-rust`) returns nothing.
- [ ] CI pipeline runs green with only `be-rust` + `fe/` in the build matrix.
