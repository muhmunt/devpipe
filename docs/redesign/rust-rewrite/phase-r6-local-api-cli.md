# Phase R6 — Local API + CLI (spec §40-41) — optional, scoped for a hosted website

Goal: decide and (if justified) build the automation surface spec §40-41
describe. This phase is explicitly conditional — do not build speculatively.

## Scoping decision (make this call before writing any code)
Spec's "local API" (§40) assumes the app runs **on the user's own machine**
(Unix domain socket, no auth needed, trusted local caller). devpipe is a
**hosted website** with a shared Postgres backend — "local API" doesn't map
1:1. Two real paths:

- **(a) If devpipe is meant to be self-hosted/run-locally by each developer**
  (check deployment intent — is there a plan for individual devs to run
  `be-rust` on their own machine against their own repos?): then a genuine
  local Unix-socket API + `dp` CLI makes sense, mirrors spec exactly.
- **(b) If devpipe stays a shared hosted service**: skip the Unix-socket
  local API. The existing HTTP API (R0-R5, already authenticated/networked)
  *is* the automation surface — a CLI (`dp`) can just be a thin HTTP client
  wrapper, no local socket needed.

**Do not proceed with either build until this is confirmed** — it changes
the CLI's transport entirely.

## Tasks (assuming path (b) — thin HTTP CLI, most likely given "still a
website" instruction from earlier in this conversation)

### 6.1 — `dp` CLI (new Rust binary crate, `be-rust/cli/` or separate `dp-cli/`)
```
dp status
dp workspace list
dp workspace open <path>
dp session list
dp session send <id> "message"
dp worktree create <repo> <branch>
dp worktree diff <id>
```
- Thin wrapper: each subcommand is an HTTP call to the existing `be-rust` API
  (R0-R5 endpoints) + an API token for auth (see 6.2).
- Output: human-readable table by default, `--json` flag for scripting
  (matches spec §41's examples).

### 6.2 — API token auth (new, since HTTP API is now reachable outside the
browser session)
- Simple bearer-token scheme: `POST /api/tokens` (creates a token, shown once),
  subsequent CLI calls send `Authorization: Bearer <token>`.
- This is the **first** auth mechanism in the app (R0 noted none exists yet)
  — scope it narrowly to "CLI access token," don't build a general user-auth
  system here unless that's already a separate requirement.

## Acceptance criteria (only if path (b) chosen and built)
- `dp session send <id> "..."` produces the same effect as sending from the
  web UI (same endpoint, same event stream).
- Token-less requests to token-gated endpoints get 401, not silently allowed.

## Manual test checklist
- [ ] `dp status` against a running `be-rust` instance returns real data.
- [ ] `dp session send` triggers a visible event in the web UI's live timeline for that session.
- [ ] Revoked token immediately loses access on next CLI call.

## If scoping decision is "skip this phase entirely"
Document that decision here with the reasoning, and do not build `dp` — the
web UI (R5) remains the only interface. This is a legitimate outcome, not a
gap — re-flag CLI as a future phase only if automation becomes a real ask.
