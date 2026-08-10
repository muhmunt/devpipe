//! Process lifecycle (Rung 4 / phase-r3.1). Tracks spawned child processes so
//! they can be killed on demand or on server shutdown — no orphaned agent
//! processes left running after a restart.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::{Child, ChildStdout, Command};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};
use uuid::Uuid;

use crate::domain::{DomainError, Result};

pub struct ProcessManager {
    children: Arc<Mutex<HashMap<Uuid, Child>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self { children: Arc::new(Mutex::new(HashMap::new())) }
    }

    /// Spawns `cmd`, tracks it under `id`, and returns its stdout pipe for
    /// the caller to stream — the child itself stays tracked so `kill`/
    /// `wait` can still reach it.
    pub async fn spawn_capture(&self, id: Uuid, mut cmd: Command) -> Result<ChildStdout> {
        cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(DomainError::Io)?;
        let stdout = child.stdout.take().ok_or_else(|| DomainError::Invalid("no stdout pipe".into()))?;
        self.children.lock().await.insert(id, child);
        Ok(stdout)
    }

    /// Awaits the tracked child's exit, removing it from the table. Returns
    /// the exit code, or -1 if it couldn't be determined.
    pub async fn wait(&self, id: Uuid) -> Result<i32> {
        let mut child = {
            let mut children = self.children.lock().await;
            children.remove(&id)
        };
        match &mut child {
            Some(c) => {
                let status = c.wait().await.map_err(DomainError::Io)?;
                Ok(status.code().unwrap_or(-1))
            }
            None => Ok(-1),
        }
    }

    pub async fn kill(&self, id: Uuid) -> Result<()> {
        let mut children = self.children.lock().await;
        if let Some(child) = children.get_mut(&id) {
            terminate_gracefully(child).await?;
            children.remove(&id);
        }
        Ok(())
    }

    /// Terminates every tracked child — call on server shutdown so nothing
    /// is left running after the process manager itself goes away.
    pub async fn kill_all(&self) {
        let mut children = self.children.lock().await;
        for (_, child) in children.iter_mut() {
            let _ = terminate_gracefully(child).await;
        }
        children.clear();
    }
}

impl Default for ProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

async fn terminate_gracefully(child: &mut Child) -> Result<()> {
    if let Some(pid) = child.id() {
        // SIGTERM first, matching spec §37: graceful shutdown before force-kill.
        unsafe {
            libc_kill(pid as i32, 15);
        }
        if timeout(Duration::from_secs(5), child.wait()).await.is_err() {
            let _ = child.kill().await; // SIGKILL fallback via tokio
        }
    } else {
        let _ = child.kill().await;
    }
    Ok(())
}

// Minimal SIGTERM shim without pulling in the `nix` crate for one syscall.
extern "C" {
    fn kill(pid: i32, sig: i32) -> i32;
}
unsafe fn libc_kill(pid: i32, sig: i32) {
    let _ = kill(pid, sig);
}
