# Phase R3 — Agent Adapter + Process Manager (spec §9, §37-39)

Goal: implement `AgentAdapter`/`SessionHandle` traits from R0, plus the
process lifecycle that runs `claude`/`cursor` (the two agents devpipe targets
— not expanding provider count in this rewrite unless requested separately).
Old Go adapter code is deleted (`phase-r-delete-everything.md`) — this phase
is designed fresh against each CLI's actual documented interface, not ported
from prior behavior.

## Tasks

### 3.1 — Process manager
```rust
pub struct ProcessManager { /* tracks child PIDs, per spec §37 */ }
impl ProcessManager {
    async fn spawn(&self, cmd: Command, cwd: &Path, env: HashMap<String,String>) -> Result<ChildHandle>;
    async fn kill(&self, id: Uuid) -> Result<()>;
    fn status(&self, id: Uuid) -> ProcessStatus;
}
```
- Built on `tokio::process::Command` with piped stdout/stderr.
- Graceful shutdown: on `kill()`, send SIGTERM first, SIGKILL after a timeout
  (spec §37 "gracefully handle crash/SIGTERM/SIGINT/shutdown/orphan processes").
- On `be-rust` process shutdown (Ctrl+C/SIGTERM to the server itself): iterate
  tracked children, terminate them too — no orphaned agent processes left
  running after the backend restarts.

### 3.2 — Agent detection (`detect()`, spec §38)
- `which::which("claude")` / `which::which("cursor-agent")` (add `which`
  crate) — resolve the real executable name for each CLI (check current
  install docs for Claude Code / Cursor's agent CLI, names may differ from
  the bare `claude`/`cursor` guess) before hardcoding.

### 3.3 — Claude adapter
```rust
struct ClaudeAdapter;
impl AgentAdapter for ClaudeAdapter {
    fn id(&self) -> &str { "claude" }
    async fn detect(&self) -> Result<bool> { /* which claude */ }
    async fn start(&self, cfg: StartConfig) -> Result<SessionHandle> {
        // spawn `claude` in cfg.worktree_path, cwd set, capture stdout
    }
}
```
- Determine the real invocation (flags for headless/non-interactive mode,
  stdin/stdout protocol, how prompts/output are framed) from Claude Code's
  actual CLI docs/`--help` output — do not guess a plausible-looking command
  line; verify against the real binary before wiring it up.

### 3.4 — Cursor adapter
- Same pattern: verify Cursor's agent-CLI invocation against its actual
  `--help`/docs, not assumed from memory.

### 3.5 — Output → event translation (feeds R4)
- Raw stdout/stderr lines get parsed into `AgentEvent` variants (R4 defines
  the enum) — this file only defines the adapter-side responsibility: each
  adapter owns its own output format, translates into the *shared* normalized
  event type before publishing to the event bus.

## Acceptance criteria
- `detect()` correctly reports true/false for claude/cursor against a real
  machine (present and absent cases both tested).
- `start()` spawns a real agent process scoped to a given worktree path,
  `SessionHandle::events()` receiver gets at least a `SESSION_STARTED` event.
- Killing a session mid-run terminates the real OS process (verify via `ps`).

## Manual test checklist
- [ ] Start a Claude session against a real worktree, confirm process appears in `ps`, cwd is the worktree path.
- [ ] Stop the session via API, confirm process gone from `ps` within the SIGTERM timeout.
- [ ] Kill `be-rust` server process itself mid-session, confirm no orphaned `claude` process survives.
- [ ] `detect()` returns correct true/false on a machine with both agents present, and on one with neither.
