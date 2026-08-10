# Phase R4 — Normalized Event Protocol + Session Persistence (spec §11-13, §42, §45)

Goal: turn raw agent output (R3) into the normalized event stream the
frontend (R5) consumes, and persist it durably.

## Tasks

### 4.1 — `AgentEvent` enum (spec §42, trimmed to what devpipe needs)
```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentEvent {
    SessionStarted { session_id: Uuid },
    MessageDelta { session_id: Uuid, role: Role, text: String },
    ToolStarted { session_id: Uuid, tool: String, input: serde_json::Value },
    ToolOutput { session_id: Uuid, tool: String, output: String },
    FileChanged { session_id: Uuid, path: String },
    NeedsInput { session_id: Uuid, question: String },
    UsageUpdated { session_id: Uuid, tokens: Option<u64> }, // only if adapter actually reports this — omit field population if not, per earlier "no fabricated metrics" rule
    SessionIdle { session_id: Uuid },
    SessionCompleted { session_id: Uuid, exit_code: i32 },
    SessionError { session_id: Uuid, message: String },
}
```
- Every variant maps to a `session_events` row (R0 schema): `event_type` =
  serde tag, `payload` = the rest, `created_at` = server time (append-only,
  never mutated).

### 4.2 — Event bus
- `tokio::sync::broadcast` channel per active session (or one global channel
  filtered by `session_id` — pick per-session channels, simpler backpressure
  story, matches spec §13's per-consumer fan-out diagram).
- Every event: written to `session_events` (durable) AND broadcast to live
  subscribers (real-time) — in that order, so a slow/disconnected frontend
  never causes an event to be lost from history.

### 4.3 — SSE endpoint
```
GET /api/sessions/:id/events            (SSE stream, live tail)
GET /api/sessions/:id/events?since=...  (replay from session_events table, for reconnect/scrollback)
```
- Matches spec §78's WebSocket/event API intent, using SSE (matches existing
  Go pattern — `stream.Hub` was SSE, keep the same transport, don't add
  WebSocket complexity without a concrete need).

### 4.4 — Chat/timeline read model
- `GET /api/sessions/:id/timeline` — reconstructs a chat-view-friendly list
  from `session_events` (groups `MessageDelta` chunks into complete messages,
  surfaces `ToolStarted`/`ToolOutput` as distinct blocks) — this is the
  server-side equivalent of the old Go `ChatHandler`/`chatFormat.ts` logic;
  port the *grouping* logic, not the transport.

### 4.5 — "Needs input" resolution (closes earlier gap-audit item, spec §61)
- `POST /api/sessions/:id/reply` — while `status = needs_input`, sends the
  reply as adapter stdin (via R3's `SessionHandle::send`), transitions status
  back to `running`. While `status = running`, same endpoint sends a new
  instruction (no special-casing needed if the adapter's stdin protocol
  treats both identically — verify against R3's Claude/Cursor adapters).

## Acceptance criteria
- Every `AgentEvent` emitted during a session is both queryable via
  `GET /timeline` after the fact and observable live via SSE during the run —
  tested by running a real session, disconnecting the SSE client mid-run,
  reconnecting with `?since=`, confirming no gap in event history.
- `NeedsInput` → reply → `running` loop works end-to-end against a real agent.

## Manual test checklist
- [ ] Open SSE stream, start a session, confirm events arrive in order.
- [ ] Disconnect SSE client, wait, reconnect with `since` param, confirm missed events replay.
- [ ] Trigger a `needs_input` state (or simulate via a fake adapter, see R-testing note below), reply, confirm session resumes.
- [ ] Confirm `session_events` table row count matches exactly what the SSE stream delivered (no duplicate/missing events).

## Testing note
Consider a `FakeAdapter` (spec §80) for R3/R4 test suites — deterministic
scripted event sequence, no real API tokens spent running tests. Only build
this if manual testing against real Claude/Cursor becomes a bottleneck; not a
blocking requirement for R4 to ship.
