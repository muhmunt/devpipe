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
//! Claude's stream-json output is structurally parsed (`claude_events`),
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
//! hook/init/rate-limit/result noise. Cursor/CustomCliAdapter still forward
//! raw lines (`raw_passthrough`) — their stream-json shape (partial or not)
//! hasn't been verified live.

use async_trait::async_trait;
use serde::Deserialize;
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

/// Turns one line of a CLI's stdout into zero or more chat events. Plain fn
/// pointers (not closures) — every implementation is stateless, so this
/// stays `Copy`/`Send`/`Sync` for free and needs no boxing.
type LineParser = fn(Uuid, &str) -> Vec<AgentEvent>;

/// No structured format to parse (Cursor/CustomCliAdapter — unverified
/// stream-json shape, see module doc): each line becomes its own message.
/// The frontend concatenates consecutive same-role deltas with no inserted
/// separator (correct for Claude's token deltas, which carry their own
/// embedded whitespace) — so a whole-line delta has to supply its own
/// trailing newline to keep reconstructing as separate lines.
fn raw_passthrough(session_id: Uuid, line: &str) -> Vec<AgentEvent> {
    vec![AgentEvent::MessageDelta { session_id, role: "agent".into(), text: format!("{line}\n") }]
}

#[derive(Deserialize)]
struct ClaudeLine {
    #[serde(rename = "type")]
    kind: String,
    event: Option<ClaudeStreamEvent>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClaudeStreamEvent {
    ContentBlockStart { content_block: ClaudeContentBlockStart },
    ContentBlockDelta { delta: ClaudeDelta },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClaudeContentBlockStart {
    ToolUse { name: String },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClaudeDelta {
    TextDelta { text: String },
    #[serde(other)]
    Other,
}

/// Only `type: "stream_event"` lines carry live content (see module doc for
/// why `--include-partial-messages` matters). Within those: a `text_delta`
/// is a chunk of the assistant's reply, forwarded as-is — deltas are exact
/// substrings of the final text (including embedded newlines), so the
/// frontend reconstructs the message by straight concatenation, no
/// separator inserted. A `tool_use` content block starting fires
/// `ToolStarted` (the domain model carried this variant since Rung 5 with
/// no adapter ever populating it — this is that adapter); the tool's input
/// streams in afterward as `input_json_delta` fragments, which aren't
/// accumulated here — not needed for "is the agent calling a tool right
/// now", which is what the transcript shows. Everything else — hooks,
/// `message_start`/`stop`, `thinking` deltas, the periodic `assistant`
/// snapshot lines, `rate_limit_event`, the trailing `result` line — is
/// dropped.
fn claude_events(session_id: Uuid, line: &str) -> Vec<AgentEvent> {
    let Ok(parsed) = serde_json::from_str::<ClaudeLine>(line) else { return vec![] };
    if parsed.kind != "stream_event" {
        return vec![];
    }
    match parsed.event {
        Some(ClaudeStreamEvent::ContentBlockDelta { delta: ClaudeDelta::TextDelta { text } }) => {
            vec![AgentEvent::MessageDelta { session_id, role: "agent".into(), text }]
        }
        Some(ClaudeStreamEvent::ContentBlockStart { content_block: ClaudeContentBlockStart::ToolUse { name } }) => {
            vec![AgentEvent::ToolStarted { session_id, tool: name, input: serde_json::json!({}) }]
        }
        _ => vec![],
    }
}

/// How to re-invoke the CLI for a follow-up turn: `args` is everything
/// except the trailing prompt, so `send()` appends the new input the same
/// way `start()` appended the initial prompt.
struct Resume {
    program: String,
    args: Vec<String>,
    cwd: PathBuf,
    parse_line: LineParser,
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
        tokio::spawn(forward_output(self.pm.clone(), self.id, self.tx.clone(), stdout, true, resume.parse_line));
        Ok(())
    }
    async fn stop(&self) -> Result<()> {
        self.pm.kill(self.id).await
    }
}

/// Streams stdout lines into the event channel via `parse_line` (structured
/// for Claude, raw passthrough for anything else — see `LineParser`), then
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
    parse_line: LineParser,
) {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        for ev in parse_line(session_id, &line) {
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
    parse_line: LineParser,
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
        forward_output(pm_for_forward, session_id, tx_clone, stdout, resumable, parse_line).await;
    });

    Ok(Box::new(SpawnedSession { id: session_id, tx, pm, forward: std::sync::Mutex::new(Some(forward)), resume }))
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
        let base = |flag_name: &str, flag_value: String, model: &Option<String>| {
            let mut a = vec![
                "-p".to_string(),
                "--output-format".to_string(),
                "stream-json".to_string(),
                "--verbose".to_string(),
                "--include-partial-messages".to_string(),
            ];
            if let Some(model) = model {
                a.push("--model".to_string());
                a.push(model.clone());
            }
            a.push(flag_name.to_string());
            a.push(flag_value);
            a
        };

        // `--session-id` lets us pick the id ourselves, so `--resume` on
        // every later turn doesn't need to scrape an id out of the CLI's
        // own output (verified against `claude --help`: both flags exist).
        let mut args = base("--session-id", cfg.session_id.to_string(), &cfg.model);
        args.push(cfg.prompt.clone());

        let resume_args = base("--resume", cfg.session_id.to_string(), &cfg.model);
        let resume =
            Resume { program: "claude".to_string(), args: resume_args, cwd: cfg.worktree_path.clone(), parse_line: claude_events };

        spawn_and_stream(self.pm.clone(), cfg.session_id, "claude", args, cfg.worktree_path, Some(resume), claude_events).await
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
        spawn_and_stream(self.pm.clone(), cfg.session_id, "cursor-agent", args, cfg.worktree_path, None, raw_passthrough).await
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
        spawn_and_stream(self.pm.clone(), cfg.session_id, &self.executable, args, cfg.worktree_path, None, raw_passthrough).await
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
            .start(StartConfig { session_id, worktree_path: std::env::temp_dir(), model: None, reasoning_level: None, prompt: "test prompt".into() })
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
            .start(StartConfig { session_id, worktree_path: std::env::temp_dir(), model: None, reasoning_level: None, prompt: "test prompt".into() })
            .await
            .expect("start should succeed");

        // give the process a moment to actually be running
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        let start = std::time::Instant::now();
        handle.stop().await.expect("stop should succeed");
        assert!(start.elapsed() < std::time::Duration::from_secs(5), "kill should not wait for the full sleep");
    }
}
