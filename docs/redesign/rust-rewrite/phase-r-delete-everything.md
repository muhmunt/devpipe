# Phase R(-1) — Delete Everything (runs first, before R0)

Goal: clear the slate. Full rewrite means no legacy code, no behavior-parity
constraint, no "port the old logic" steps anywhere else in this plan — every
later phase (R0-R8) is now written against `super_engineering_reference_spec.md`
directly, not against what `be`/`fe` used to do.

**This is a destructive, hard-to-reverse action. Confirm explicitly before
executing — do not run these commands as part of "planning."** Recommended
safety net even with explicit go-ahead: this repo is git-tracked, so deleted
code is recoverable from history — but any **data** (Postgres rows) is not
recoverable unless backed up first.

## Tasks

### D.1 — Backup before deleting
- `pg_dump` the current `devpipe` Postgres database to a file, store outside
  the repo (or in a git-ignored `docs/redesign/backup/` if small) — old
  `cards`/`prds`/`plans`/`runs`/`chat` data is not migrated forward in this
  version of the plan (no R7-style migration script anymore, since "rewrite
  from zero" means the new schema owes nothing to the old rows). If any of
  that data matters, the backup is the only way to recover it later — confirm
  with the user whether this data is disposable before running the dump-and-drop.

### D.2 — Delete backend
```
git rm -r be/
```
- Removes the entire Go module: `be/cmd`, `be/internal`, `go.mod`, everything.

### D.3 — Delete frontend source (keep project scaffolding)
```
git rm -r fe/src
```
- Keep: `fe/package.json`, `fe/vite.config.ts`, `fe/tsconfig*.json`,
  `fe/tailwind`/`postcss` config, `fe/index.html` (trim its `<div id="root">`
  shell only, not the whole file), `fe/public` if present.
- Recreate a minimal `fe/src/main.tsx` + empty `fe/src/App.tsx` stub so the
  Vite dev server still boots to a blank page — this is the actual "zero"
  starting point R6 (frontend rebuild) begins from.
- Delete `fe/src/components`, `fe/src/pages`, `fe/src/lib`, `fe/src/assets`
  entirely — no `StatusDot`/`AppShell`/token work carried forward, per your
  instruction that this is a from-zero rebuild, not a continuation of the
  earlier design-system phases.

### D.4 — `be-rust` — keep or reset?
- `be-rust/` (204-line axum+sqlx skeleton) is the **only** pre-existing thing
  worth keeping, and only as bare scaffolding (`Cargo.toml` deps, the fact
  that it binds axum to a port and connects sqlx) — its two `cards` routes
  and `db.rs`/`handlers.rs` content still get deleted/replaced in the new
  R0-R1, since the `cards` table doesn't exist in the new schema. Keep the
  crate/binary shell, delete its business logic:
```
rm be-rust/src/db.rs be-rust/src/handlers.rs
# main.rs trimmed to a bare axum server with no routes, filled in by phase-r1
```

### D.5 — Clean dangling references
- Remove any CI workflow, `Justfile` target, or `cliff.toml` scope referencing
  `be/` (Go) or the deleted `fe/src` paths, so the build doesn't fail on
  missing files before R1/R6 land replacement code.
- This will leave the repo in a **non-functional state** between D.5 and the
  end of R1 (backend) + R6 (frontend) — expected for a from-zero rewrite; not
  a bug. Consider doing this work on a dedicated branch, not `main`, until
  R1+R6 restore a working app (matches your standing preference against
  destructive actions on shared branches without confirmation).

## Acceptance criteria
- `be/` does not exist.
- `fe/src` contains only the minimal boot stub (blank app, no old components/pages/lib).
- `be-rust/` compiles (`cargo check`) as an empty axum server, no `cards`-table code left.
- Database backed up (D.1) before any destructive DB action, if one is taken here (this phase itself does not drop tables — schema deletion happens naturally when R0's migrations replace it in R1, or explicitly if you want a clean DB now — confirm before dropping).

## Explicit confirmation needed before running D.2/D.3
State clearly which of these you want executed now vs. left as documented
plan for later:
- [ ] Delete `be/` now
- [ ] Delete `fe/src` now
- [ ] Reset `be-rust/` business logic now
- [ ] Back up + note on existing Postgres data (keep/drop/ignore)
