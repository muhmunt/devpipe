# Phase R8 — Observability Dashboard + Security Hardening (spec §43, §47)

Goal: same content/intent as the earlier Go-plan's `phase-7.2`/`phase-7.3`,
re-scoped to the new Rust entity model. Run after R7 cutover so it targets the
final schema, not the transitional one.

## Tasks

### 8.1 — Observability dashboard (spec §43)
- `GET /api/observability/sessions` — aggregate view over `agent_sessions` +
  `session_events`: `agent | status | elapsed | files_changed | tests` per
  session, columns populated only from real data:
  - `files_changed`: count from `FileChanged` events (R4) or R2's diff endpoint.
  - `tests`: only if an adapter ever emits a test-result event — if no
    adapter reports this (confirm against R3's Claude/Cursor adapters),
    omit the column entirely rather than showing empty dashes for every row.
- No tokens/cost columns unless R3/R4 actually captures `UsageUpdated` events
  with real data (per R4.1's note that this field may go unpopulated) —
  same "ship what's real" rule as the earlier plan.

### 8.2 — Security hardening pass
Audit every `be-rust` endpoint added across R1-R7:
- No secret (CLI API tokens from R6.2, GitHub tokens if editor-handoff/PR
  actions were built) ever appears in a JSON response body or a log line
  (`tower-http`'s tracing layer — configure it to skip body logging on
  token-bearing routes, don't disable request logging globally).
- Every shell/process invocation (`git` in R2, agent binaries in R3, repo
  scripts in R5.5) uses argument arrays (`Command::new(bin).arg(x)`), never
  string-interpolated shell commands — confirms R2's injection-prevention
  rule held across the whole rewrite, not just the git module.
- Path parameters that resolve to filesystem paths (worktree path, repo
  script execution cwd) are validated against the DB-stored canonical path
  for that entity — never trust a client-supplied path directly.
- Tokens (R6.2) hashed at rest in Postgres (never store raw bearer tokens in
  plaintext), only the hash is compared on auth.

### 8.3 — Final review pass
- Confirm every item in `docs/redesign/gap-audit.md`'s "Real gaps" table has
  a corresponding R-phase task (cross-reference, not re-derive) — this
  rewrite's R0-R8 should be a superset of the earlier Go-plan's phase-6/7
  content, not a regression.

## Acceptance criteria
- Dashboard ships with zero fabricated/placeholder columns.
- Security checklist run against every route registered in `be-rust`'s final
  router (enumerate via `axum::Router` debug/route-listing, don't rely on
  memory of what was added across 8 phases).

## Manual test checklist
- [ ] Observability dashboard row count matches `agent_sessions` table count exactly.
- [ ] `grep` server logs after exercising every token-bearing endpoint — zero token substrings present.
- [ ] Attempt path traversal on every filesystem-touching endpoint (worktree create, repo script run) — all rejected.
- [ ] Confirm gap-audit.md cross-reference: every "Real gaps" row has a matching R-phase task cited.
