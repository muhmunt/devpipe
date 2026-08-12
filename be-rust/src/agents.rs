//! Agent detection + adapters (Rung 4 / phase-r3.2-3.4, phase-r9.3).
//! Claude/Cursor invocations verified against real `--help` output on the
//! build machine, not guessed. Follow-up turns (`send()`) re-invoke the CLI
//! one-shot per call rather than holding a long-lived stdin pipe — `claude
//! -p`/`cursor-agent -p` are documented one-shot commands.
//!
//! Claude supports real multi-turn continuity: the first turn is launched
//! with `--session-id <our uuid>` (a client-supplied id, verified against
//! `claude --help`), so every later turn can resume it with
//! `--resume <that same uuid>` — no need to scrape a server-generated id out
//! of the streamed output. Cursor's CLI has no equivalent "set the id"
//! flag, only `--resume [chatId]` for an id *it* generates, which we're not
//! yet capturing from the stream — `send()` stays unimplemented for Cursor
//! and CustomCliAdapter until that capture exists.
//!
//! Claude's stream-json output is structurally parsed (`ClaudeParser`),
//! verified against real `claude -p --output-format stream-json
//! --include-partial-messages` runs (plain text turn, and a tool-use turn).
//! Without `--include-partial-messages`, Claude only emits the assistant's
//! *complete* message once the whole turn finishes — for anything but a
//! one-word reply that's a multi-second silent gap before the whole answer
//! lands at once, nothing like watching Claude Code type. With the flag,
//! Claude also emits `stream_event > content_block_delta` with individual
//! `text_delta` chunks as the model generates them — that's what's parsed
//! and forwarded live, chunk by chunk. `content_block_start` for a
//! `tool_use` block similarly fires the moment the model decides to call a
//! tool, not after it's fully formed. The periodic `type: "assistant"`
//! snapshot lines (one per completed content block, cumulative) are pure
//! duplicates of what streamed already and are dropped, along with the
//! hook/init/rate-limit noise; the trailing `result` line is kept only for
//! its token counts. Cursor/CustomCliAdapter still forward raw lines
//! (`RawPassthrough`) — their stream-json shape (partial or not) hasn't been
//! verified live.
//!
//! One thing a headless run changes fundamentally: there is nobody to answer
//! a permission prompt. Under Claude's default mode every Edit/Write/Bash
//! call comes back denied, so `--permission-mode` (see
//! `CLAUDE_PERMISSION_MODES`) decides whether a chat can change anything at
//! all. It's surfaced as a per-chat choice rather than defaulted here.

use async_trait::async_trait;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{ChildStdout, Command};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::domain::{AgentAdapter, AgentEvent, DomainError, Result, SessionHandle, StartConfig};
use crate::process_manager::ProcessManager;

pub async fn detect_executable(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

type ForwardFuture = std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>;

/// Turns one line of a CLI's stdout into zero or more chat events.
///
/// Stateful, unlike the earlier plain-`fn` version: a tool call's arguments
/// arrive as a run of `input_json_delta` fragments spread across several
/// lines, and its result arrives later on a line that never names the tool —
/// only the call id. Reconstructing "the agent read src/main.rs" from that
/// needs memory across lines, which a stateless parser cannot have.
trait LineParser: Send {
    fn parse(&mut self, session_id: Uuid, line: &str) -> Vec<AgentEvent>;
}

/// One parser instance per CLI invocation — each turn re-spawns the process,
/// so each turn gets a fresh, empty parser rather than inheriting the last
/// turn's half-finished tool call.
type MakeParser = fn() -> Box<dyn LineParser>;

/// No structured format to parse (Cursor/CustomCliAdapter — unverified
/// stream-json shape, see module doc): each line becomes its own message.
/// The frontend concatenates consecutive same-role deltas with no inserted
/// separator (correct for Claude's token deltas, which carry their own
/// embedded whitespace) — so a whole-line delta has to supply its own
/// trailing newline to keep reconstructing as separate lines.
struct RawPassthrough;

impl LineParser for RawPassthrough {
    fn parse(&mut self, session_id: Uuid, line: &str) -> Vec<AgentEvent> {
        vec![AgentEvent::MessageDelta { session_id, role: "agent".into(), text: format!("{line}\n") }]
    }
}

fn make_raw_passthrough() -> Box<dyn LineParser> {
    Box::new(RawPassthrough)
}

/// A tool call being assembled: Claude announces the name and id up front,
/// then streams the arguments in as JSON fragments.
struct PendingTool {
    call_id: String,
    name: String,
    json: String,
}

/// Parses Claude's `stream-json` output (shapes verified against real runs —
/// a plain-text turn and a two-tool turn — not guessed).
///
/// Four line shapes matter:
///
/// - `stream_event > content_block_delta > text_delta` — a chunk of the
///   reply. Deltas are exact substrings of the final text, embedded newlines
///   and all, so the frontend rebuilds the message by plain concatenation.
/// - `stream_event > content_block_start > tool_use` — the model has decided
///   to call a tool. Name and `toolu_...` id are known here; the arguments
///   are not, so this only opens `pending`.
/// - `stream_event > content_block_delta > input_json_delta` — one fragment
///   of those arguments. Accumulated until `content_block_stop`, at which
///   point the whole call is known and `ToolStarted` fires with real input.
///   Emitting at `content_block_start` instead would be marginally earlier
///   but would say "ran Bash" with no command and "read a file" with no
///   path, which is not worth the few hundred milliseconds.
/// - a top-level `user` line carrying `tool_result` — the tool's output.
///   It identifies the call only by `tool_use_id`, hence `names`.
///
/// The trailing `result` line carries the turn's real token usage, which
/// becomes `UsageUpdated`. Everything else — hooks, `message_start`/`stop`,
/// `thinking` deltas (encrypted, no readable content), the cumulative
/// `assistant` snapshots that merely repeat what already streamed,
/// `rate_limit_event` — is dropped.
#[derive(Default)]
struct ClaudeParser {
    pending: Option<PendingTool>,
    names: std::collections::HashMap<String, String>,
}

fn make_claude_parser() -> Box<dyn LineParser> {
    Box::<ClaudeParser>::default()
}

/// A tool result's `content` is a string for most tools but an array of
/// content blocks for a few (images, structured returns). Render what can be
/// read as text; fall back to the raw JSON rather than dropping it.
fn tool_result_text(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(items) => items
            .iter()
            .map(|item| item.get("text").and_then(|t| t.as_str()).map(str::to_string).unwrap_or_else(|| item.to_string()))
            .collect::<Vec<_>>()
            .join("\n"),
        other => other.to_string(),
    }
}

impl ClaudeParser {
    fn stream_event(&mut self, session_id: Uuid, event: &serde_json::Value) -> Vec<AgentEvent> {
        match event.get("type").and_then(|v| v.as_str()) {
            Some("content_block_start") => {
                let block = event.get("content_block");
                if block.and_then(|b| b.get("type")).and_then(|v| v.as_str()) == Some("thinking") {
                    return vec![AgentEvent::Thinking { session_id }];
                }
                if block.and_then(|b| b.get("type")).and_then(|v| v.as_str()) == Some("tool_use") {
                    let call_id = block.and_then(|b| b.get("id")).and_then(|v| v.as_str()).unwrap_or_default();
                    let name = block.and_then(|b| b.get("name")).and_then(|v| v.as_str()).unwrap_or("tool");
                    self.pending =
                        Some(PendingTool { call_id: call_id.to_string(), name: name.to_string(), json: String::new() });
                }
                vec![]
            }
            Some("content_block_delta") => {
                let delta = event.get("delta");
                match delta.and_then(|d| d.get("type")).and_then(|v| v.as_str()) {
                    Some("text_delta") => {
                        let text = delta.and_then(|d| d.get("text")).and_then(|v| v.as_str()).unwrap_or_default();
                        if text.is_empty() {
                            return vec![];
                        }
                        vec![AgentEvent::MessageDelta { session_id, role: "agent".into(), text: text.to_string() }]
                    }
                    Some("input_json_delta") => {
                        if let Some(pending) = self.pending.as_mut() {
                            if let Some(fragment) = delta.and_then(|d| d.get("partial_json")).and_then(|v| v.as_str()) {
                                pending.json.push_str(fragment);
                            }
                        }
                        vec![]
                    }
                    _ => vec![],
                }
            }
            Some("content_block_stop") => {
                let Some(pending) = self.pending.take() else { return vec![] };
                let input = serde_json::from_str(&pending.json).unwrap_or(serde_json::json!({}));
                self.names.insert(pending.call_id.clone(), pending.name.clone());
                vec![AgentEvent::ToolStarted { session_id, call_id: pending.call_id, tool: pending.name, input }]
            }
            _ => vec![],
        }
    }

    fn tool_results(&self, session_id: Uuid, message: &serde_json::Value) -> Vec<AgentEvent> {
        let Some(items) = message.get("content").and_then(|c| c.as_array()) else { return vec![] };
        items
            .iter()
            .filter(|item| item.get("type").and_then(|v| v.as_str()) == Some("tool_result"))
            .map(|item| {
                let call_id = item.get("tool_use_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let tool = self.names.get(&call_id).cloned().unwrap_or_else(|| "tool".to_string());
                let output = item.get("content").map(tool_result_text).unwrap_or_default();
                let is_error = item.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                AgentEvent::ToolOutput { session_id, call_id, tool, output, is_error }
            })
            .collect()
    }
}

impl LineParser for ClaudeParser {
    fn parse(&mut self, session_id: Uuid, line: &str) -> Vec<AgentEvent> {
        let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line) else { return vec![] };
        match parsed.get("type").and_then(|v| v.as_str()) {
            Some("stream_event") => match parsed.get("event") {
                Some(event) => self.stream_event(session_id, event),
                None => vec![],
            },
            // Tool results come back framed as a user turn — that's the shape
            // the model sees, not a message the person typed, so it becomes a
            // tool row rather than a chat bubble.
            Some("user") => match parsed.get("message") {
                Some(message) => self.tool_results(session_id, message),
                None => vec![],
            },
            Some("result") => {
                let usage = parsed.get("usage");
                let total: u64 = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]
                    .iter()
                    .filter_map(|k| usage.and_then(|u| u.get(*k)).and_then(|v| v.as_u64()))
                    .sum();
                if total == 0 {
                    return vec![];
                }
                vec![AgentEvent::UsageUpdated { session_id, tokens: Some(total) }]
            }
            _ => vec![],
        }
    }
}

/// How to re-invoke the CLI for a follow-up turn: `args` is everything
/// except the trailing prompt, so `send()` appends the new input the same
/// way `start()` appended the initial prompt.
struct Resume {
    program: String,
    args: Vec<String>,
    cwd: PathBuf,
    make_parser: MakeParser,
}

struct SpawnedSession {
    id: Uuid,
    tx: broadcast::Sender<AgentEvent>,
    pm: Arc<ProcessManager>,
    // Forwarding (including the SessionStarted event) is deferred until the
    // first subscriber attaches — tokio::sync::broadcast does not buffer for
    // subscribers that join after a send, so starting eagerly would silently
    // drop SessionStarted for any caller that hasn't subscribed yet.
    forward: std::sync::Mutex<Option<ForwardFuture>>,
    resume: Option<Resume>,
}

#[async_trait]
impl SessionHandle for SpawnedSession {
    fn id(&self) -> Uuid {
        self.id
    }
    fn events(&self) -> broadcast::Receiver<AgentEvent> {
        let rx = self.tx.subscribe();
        if let Some(fut) = self.forward.lock().unwrap().take() {
            tokio::spawn(fut);
        }
        rx
    }
    async fn send(&self, input: &str) -> Result<()> {
        let Some(resume) = &self.resume else {
            return Err(DomainError::Invalid("multi-turn resume not supported for this agent".into()));
        };
        let mut args = resume.args.clone();
        args.push(input.to_string());
        let mut cmd = Command::new(&resume.program);
        cmd.args(&args).current_dir(&resume.cwd);
        let stdout = self.pm.spawn_capture(self.id, cmd).await?;
        tokio::spawn(forward_output(self.pm.clone(), self.id, self.tx.clone(), stdout, true, (resume.make_parser)()));
        Ok(())
    }
    async fn stop(&self) -> Result<()> {
        self.pm.kill(self.id).await
    }
}

/// Streams stdout lines into the event channel via `parser` (structured for
/// Claude, raw passthrough for anything else — see `LineParser`), then
/// signals what happens next: a resumable session that exits clean (0) goes
/// `SessionIdle` (the chat stays open for another turn via `send()`);
/// anything else — non-resumable, or a nonzero exit — goes
/// `SessionCompleted` (terminal).
async fn forward_output(
    pm: Arc<ProcessManager>,
    session_id: Uuid,
    tx: broadcast::Sender<AgentEvent>,
    stdout: ChildStdout,
    resumable: bool,
    mut parser: Box<dyn LineParser>,
) {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        for ev in parser.parse(session_id, &line) {
            let _ = tx.send(ev);
        }
    }
    let exit_code = pm.wait(session_id).await.unwrap_or(-1);
    if resumable && exit_code == 0 {
        let _ = tx.send(AgentEvent::SessionIdle { session_id });
    } else {
        let _ = tx.send(AgentEvent::SessionCompleted { session_id, exit_code });
    }
}

/// Spawns `program` with `args` via the shared `ProcessManager` (so it's
/// tracked for `kill`/shutdown-cleanup), cwd = worktree path, streams the
/// first turn's output. `resume`, when set, is stashed on the returned
/// handle so `send()` can launch follow-up turns against the same
/// conversation.
async fn spawn_and_stream(
    pm: Arc<ProcessManager>,
    session_id: Uuid,
    program: &str,
    args: Vec<String>,
    cwd: PathBuf,
    resume: Option<Resume>,
    make_parser: MakeParser,
) -> Result<Box<dyn SessionHandle>> {
    let (tx, _rx) = broadcast::channel(1024);
    let tx_clone = tx.clone();
    let resumable = resume.is_some();

    let mut cmd = Command::new(program);
    cmd.args(&args).current_dir(&cwd);
    let stdout = pm.spawn_capture(session_id, cmd).await?;

    let pm_for_forward = pm.clone();
    let forward: ForwardFuture = Box::pin(async move {
        let _ = tx_clone.send(AgentEvent::SessionStarted { session_id });
        forward_output(pm_for_forward, session_id, tx_clone, stdout, resumable, make_parser()).await;
    });

    Ok(Box::new(SpawnedSession { id: session_id, tx, pm, forward: std::sync::Mutex::new(Some(forward)), resume }))
}

/// Model aliases Claude's own `--help` names ("Provide an alias for the
/// latest model (e.g. 'fable', 'opus', or 'sonnet')"). Only those three are
/// offered — the CLI accepts full model names too, but guessing at aliases
/// it doesn't document would produce a picker whose options fail at spawn.
pub const CLAUDE_MODELS: [&str; 3] = ["opus", "sonnet", "fable"];

/// `--effort <level>` values, likewise straight from `claude --help`.
pub const CLAUDE_EFFORTS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

/// `--permission-mode <mode>` values worth offering. This matters more than
/// it looks: a headless `claude -p` run has nobody to answer a permission
/// prompt, so under the default mode every Edit, Write and Bash call comes
/// back denied and the agent can only read.
///
/// What each mode permits was measured by running it through this server,
/// not inferred from its name:
///
/// - `manual` (the CLI default) — nothing; every tool call is refused.
/// - `plan` — read and plan, make no changes.
/// - `acceptEdits` — writes files, but commands are still refused.
/// - `bypassPermissions` — files and commands both.
///
/// `auto` and `dontAsk` are real flag values but aren't listed: measured
/// here, `dontAsk` refused Bash and allowed Read, making it indistinguishable
/// from `manual` in practice, and `auto` matched `acceptEdits`. Offering
/// options a person can't tell apart is worse than offering fewer.
pub const CLAUDE_PERMISSION_MODES: [&str; 4] = ["manual", "plan", "acceptEdits", "bypassPermissions"];

/// Cursor publishes its model list per account, so it's asked rather than
/// hardcoded. An unauthenticated CLI answers "No models available for this
/// account." — no model line matches, so the picker correctly shows nothing
/// to choose instead of options that would fail.
pub async fn cursor_models() -> Vec<String> {
    let Ok(out) = Command::new("cursor-agent").arg("--list-models").output().await else { return vec![] };
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| l.trim().trim_start_matches(['-', '*', ' ']).trim())
        .filter(|l| !l.is_empty() && !l.contains(' ') && !l.ends_with(':'))
        .map(str::to_string)
        .collect()
}

pub struct ClaudeAdapter {
    pub pm: Arc<ProcessManager>,
}

#[async_trait]
impl AgentAdapter for ClaudeAdapter {
    fn id(&self) -> &str {
        "claude"
    }
    async fn detect(&self) -> Result<bool> {
        Ok(detect_executable("claude").await)
    }
    async fn start(&self, cfg: StartConfig) -> Result<Box<dyn SessionHandle>> {
        let effort = cfg.reasoning_level.as_deref().filter(|level| CLAUDE_EFFORTS.contains(level));
        let permission = cfg.permission_mode.as_deref().filter(|mode| CLAUDE_PERMISSION_MODES.contains(mode));
        let base = |flag_name: &str, flag_value: String| {
            let mut a = vec![
                "-p".to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--verbose".to_string(),
                "--include-partial-messages".to_string(),
            ];
            if let Some(model) = &cfg.model {
                a.push("--model".to_string());
                a.push(model.clone());
            }
            // `--effort <low|medium|high|xhigh|max>`, verified against
            // `claude --help`. An unrecognised value is dropped rather than
            // passed through, so a stale client can't make the CLI reject
            // the whole invocation.
            if let Some(effort) = effort {
                a.push("--effort".to_string());
                a.push(effort.to_string());
            }
            if let Some(permission) = permission {
                a.push("--permission-mode".to_string());
                a.push(permission.to_string());
            }
            a.push(flag_name.to_string());
            a.push(flag_value);
            a
        };

        // `--session-id` lets us pick the id ourselves, so `--resume` on
        // every later turn doesn't need to scrape an id out of the CLI's
        // own output (verified against `claude --help`: both flags exist).
        let mut args = base("--session-id", cfg.session_id.to_string());
        args.push(cfg.prompt.clone());

        let resume_args = base("--resume", cfg.session_id.to_string());
        let resume = Resume {
            program: "claude".to_string(),
            args: resume_args,
            cwd: cfg.worktree_path.clone(),
            make_parser: make_claude_parser,
        };

        spawn_and_stream(self.pm.clone(), cfg.session_id, "claude", args, cfg.worktree_path, Some(resume), make_claude_parser)
            .await
    }
}

pub struct CursorAdapter {
    pub pm: Arc<ProcessManager>,
}

#[async_trait]
impl AgentAdapter for CursorAdapter {
    fn id(&self) -> &str {
        "cursor"
    }
    async fn detect(&self) -> Result<bool> {
        Ok(detect_executable("cursor-agent").await)
    }
    async fn start(&self, cfg: StartConfig) -> Result<Box<dyn SessionHandle>> {
        let mut args = vec!["-p".to_string(), "--output-format".to_string(), "stream-json".to_string()];
        if let Some(model) = &cfg.model {
            args.push("--model".to_string());
            args.push(model.clone());
        }
        args.push(cfg.prompt.clone());
        spawn_and_stream(self.pm.clone(), cfg.session_id, "cursor-agent", args, cfg.worktree_path, None, make_raw_passthrough).await
    }
}

/// Generic adapter for user-defined agents (spec §39 / phase-r9.3): reads
/// executable + args from an `agent_definitions` row instead of being
/// hardcoded, substituting template variables before spawn.
pub struct CustomCliAdapter {
    pub agent_id: String,
    pub executable: String,
    pub default_args: Vec<String>,
    pub pm: Arc<ProcessManager>,
}

fn substitute_template(arg: &str, worktree_path: &std::path::Path, prompt: &str) -> String {
    arg.replace("{worktree}", &worktree_path.to_string_lossy()).replace("{prompt}", prompt)
}

#[async_trait]
impl AgentAdapter for CustomCliAdapter {
    fn id(&self) -> &str {
        &self.agent_id
    }
    async fn detect(&self) -> Result<bool> {
        Ok(detect_executable(&self.executable).await)
    }
    async fn start(&self, cfg: StartConfig) -> Result<Box<dyn SessionHandle>> {
        let args: Vec<String> =
            self.default_args.iter().map(|a| substitute_template(a, &cfg.worktree_path, &cfg.prompt)).collect();
        spawn_and_stream(self.pm.clone(), cfg.session_id, &self.executable, args, cfg.worktree_path, None, make_raw_passthrough).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AgentEvent;

    #[tokio::test]
    async fn custom_adapter_spawns_streams_and_completes() {
        let pm = Arc::new(ProcessManager::new());
        let adapter = CustomCliAdapter {
            agent_id: "echo-test".into(),
            executable: "sh".into(),
            default_args: vec!["-c".into(), "echo line-one; echo line-two".into()],
            pm: pm.clone(),
        };
        let session_id = Uuid::new_v4();
        let handle = adapter
            .start(StartConfig { session_id, worktree_path: std::env::temp_dir(), model: None, reasoning_level: None, permission_mode: None, prompt: "test prompt".into() })
            .await
            .expect("start should succeed");

        let mut rx = handle.events();
        let mut got_started = false;
        let mut lines = Vec::new();
        let mut completed_code = None;

        for _ in 0..10 {
            match tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv()).await {
                Ok(Ok(AgentEvent::SessionStarted { .. })) => got_started = true,
                Ok(Ok(AgentEvent::MessageDelta { text, .. })) => lines.push(text),
                Ok(Ok(AgentEvent::SessionCompleted { exit_code, .. })) => {
                    completed_code = Some(exit_code);
                    break;
                }
                _ => break,
            }
        }

        assert!(got_started, "expected SessionStarted event");
        assert_eq!(lines, vec!["line-one\n", "line-two\n"]);
        assert_eq!(completed_code, Some(0));
    }

    /// Line shapes copied verbatim from a captured `claude -p
    /// --output-format stream-json --verbose --include-partial-messages`
    /// run, so this breaks if Claude's output changes rather than passing
    /// against an invented format.
    #[test]
    fn claude_parser_reconstructs_a_tool_call_from_its_fragments() {
        let session_id = Uuid::new_v4();
        let mut parser = ClaudeParser::default();

        let noise = [
            r#"{"type":"system","subtype":"init","cwd":"/tmp"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":""}}}"#,
        ];
        for line in noise {
            assert!(parser.parse(session_id, line).is_empty(), "lifecycle noise must not reach the transcript");
        }

        // A thinking block opening is the one piece of reasoning that is
        // observable — its contents are encrypted, its existence is not.
        let thinking = r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}}"#;
        assert!(matches!(parser.parse(session_id, thinking).as_slice(), [AgentEvent::Thinking { .. }]));
        // A thinking block closing must not invent a tool row.
        assert!(parser.parse(session_id, r#"{"type":"stream_event","event":{"type":"content_block_stop","index":0}}"#).is_empty());

        let start = r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_abc","name":"Read","input":{}}}}"#;
        assert!(parser.parse(session_id, start).is_empty(), "the call is incomplete until its arguments arrive");

        for fragment in [
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"file_path\": \"/tmp/note.txt"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"}"}}}"#,
        ] {
            assert!(parser.parse(session_id, fragment).is_empty());
        }

        let stop = r#"{"type":"stream_event","event":{"type":"content_block_stop","index":1}}"#;
        match parser.parse(session_id, stop).as_slice() {
            [AgentEvent::ToolStarted { call_id, tool, input, .. }] => {
                assert_eq!(call_id, "toolu_abc");
                assert_eq!(tool, "Read");
                assert_eq!(input.get("file_path").and_then(|v| v.as_str()), Some("/tmp/note.txt"));
            }
            other => panic!("expected one ToolStarted with real input, got {other:?}"),
        }

        // The result names only the call id — the tool name has to come from
        // what the parser remembered.
        let result = r#"{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_abc","type":"tool_result","content":"1\thello world","is_error":false}]}}"#;
        match parser.parse(session_id, result).as_slice() {
            [AgentEvent::ToolOutput { call_id, tool, output, is_error, .. }] => {
                assert_eq!(call_id, "toolu_abc");
                assert_eq!(tool, "Read", "the result line carries no name; it must be recalled from the start line");
                assert_eq!(output, "1\thello world");
                assert!(!is_error);
            }
            other => panic!("expected one ToolOutput, got {other:?}"),
        }

        let text = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Note says"}}}"#;
        match parser.parse(session_id, text).as_slice() {
            [AgentEvent::MessageDelta { role, text, .. }] => {
                assert_eq!(role, "agent");
                assert_eq!(text, "Note says");
            }
            other => panic!("expected one MessageDelta, got {other:?}"),
        }

        let usage = r#"{"type":"result","is_error":false,"usage":{"input_tokens":6,"output_tokens":20,"cache_read_input_tokens":100}}"#;
        match parser.parse(session_id, usage).as_slice() {
            [AgentEvent::UsageUpdated { tokens, .. }] => assert_eq!(*tokens, Some(126)),
            other => panic!("expected one UsageUpdated, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn kill_terminates_real_process() {
        let pm = Arc::new(ProcessManager::new());
        let adapter = CustomCliAdapter {
            agent_id: "sleep-test".into(),
            executable: "sleep".into(),
            default_args: vec!["30".into()],
            pm: pm.clone(),
        };
        let session_id = Uuid::new_v4();
        let handle = adapter
            .start(StartConfig { session_id, worktree_path: std::env::temp_dir(), model: None, reasoning_level: None, permission_mode: None, prompt: "test prompt".into() })
            .await
            .expect("start should succeed");

        // give the process a moment to actually be running
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let start = std::time::Instant::now();
        handle.stop().await.expect("stop should succeed");
        assert!(start.elapsed() < std::time::Duration::from_secs(5), "kill should not wait for the full sleep");
    }
}
