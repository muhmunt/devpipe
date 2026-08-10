//! Agent detection + adapters (Rung 4 / phase-r3.2-3.4, phase-r9.3).
//! Claude/Cursor invocations verified against real `--help` output on the
//! build machine, not guessed. Follow-up turns (`send()`) re-invoke the CLI
//! one-shot per call rather than holding a long-lived stdin pipe — `claude
//! -p`/`cursor-agent -p` are documented one-shot commands; true multi-turn
//! continuity (`--resume <id>`) needs live-tested session-id capture from
//! the streamed output and is a known follow-up, not implemented blind here.

use async_trait::async_trait;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
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

struct SpawnedSession {
    id: Uuid,
    tx: broadcast::Sender<AgentEvent>,
    pm: Arc<ProcessManager>,
    // Forwarding (including the SessionStarted event) is deferred until the
    // first subscriber attaches — tokio::sync::broadcast does not buffer for
    // subscribers that join after a send, so starting eagerly would silently
    // drop SessionStarted for any caller that hasn't subscribed yet.
    forward: std::sync::Mutex<Option<ForwardFuture>>,
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
    async fn send(&self, _input: &str) -> Result<()> {
        // See module doc: one-shot re-invocation per turn is not yet wired
        // up here — needs the CLI's own session-id captured from its
        // stream-json output first (Rung 5 work, once the event bus exists
        // to carry that capture through).
        Err(DomainError::Invalid("multi-turn resume not yet implemented".into()))
    }
    async fn stop(&self) -> Result<()> {
        self.pm.kill(self.id).await
    }
}

/// Spawns `program` with `args` via the shared `ProcessManager` (so it's
/// tracked for `kill`/shutdown-cleanup), cwd = worktree path, streams each
/// stdout line into the event channel as an opaque `MessageDelta`. Real
/// structured parsing of each CLI's stream-json schema is a follow-up once
/// tested live against an authenticated session — forwarding raw lines here
/// is honest about that rather than guessing an internal wire format.
async fn spawn_and_stream(
    pm: Arc<ProcessManager>,
    session_id: Uuid,
    program: &str,
    args: Vec<String>,
    cwd: PathBuf,
) -> Result<Box<dyn SessionHandle>> {
    let (tx, _rx) = broadcast::channel(1024);
    let tx_clone = tx.clone();

    let mut cmd = Command::new(program);
    cmd.args(&args).current_dir(&cwd);
    let stdout = pm.spawn_capture(session_id, cmd).await?;

    let pm_for_wait = pm.clone();
    let forward: ForwardFuture = Box::pin(async move {
        let _ = tx_clone.send(AgentEvent::SessionStarted { session_id });
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_clone.send(AgentEvent::MessageDelta { session_id, role: "agent".into(), text: line });
        }
        let exit_code = pm_for_wait.wait(session_id).await.unwrap_or(-1);
        let _ = tx_clone.send(AgentEvent::SessionCompleted { session_id, exit_code });
    });

    Ok(Box::new(SpawnedSession { id: session_id, tx, pm, forward: std::sync::Mutex::new(Some(forward)) }))
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
        let mut args = vec![
            "-p".to_string(),
            "--output-format".to_string(),
            "stream-json".to_string(),
            "--verbose".to_string(),
        ];
        if let Some(model) = &cfg.model {
            args.push("--model".to_string());
            args.push(model.clone());
        }
        args.push(cfg.prompt.clone());
        spawn_and_stream(self.pm.clone(), cfg.session_id, "claude", args, cfg.worktree_path).await
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
        spawn_and_stream(self.pm.clone(), cfg.session_id, "cursor-agent", args, cfg.worktree_path).await
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
        spawn_and_stream(self.pm.clone(), cfg.session_id, &self.executable, args, cfg.worktree_path).await
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
        assert_eq!(lines, vec!["line-one", "line-two"]);
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
