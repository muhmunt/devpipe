// Mirrors be-rust/src/domain.rs exactly — field names match its
// #[serde(rename_all = "camelCase")] output.

export type Workspace = {
  id: string
  name: string
  color: string | null
  icon: string | null
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
}

export type Repository = {
  id: string
  workspaceId: string
  name: string
  localPath: string
  remoteUrl: string | null
  defaultBranch: string
  setupScript: string | null
  runScript: string | null
  testScript: string | null
  teardownScript: string | null
  createdAt: string
  updatedAt: string
}

export type WorktreeKind = 'primary' | 'task'
export type WorktreeStatus = 'clean' | 'modified' | 'conflicted' | 'ahead' | 'behind'

export type Worktree = {
  id: string
  repositoryId: string
  path: string
  branch: string
  targetBranch: string | null
  kind: WorktreeKind
  status: WorktreeStatus
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AgentDefinition = {
  id: string
  name: string
  executable: string
  defaultArgs: string[]
  capabilities: Record<string, unknown>
}

export type SessionStatus =
  | 'created'
  | 'starting'
  | 'running'
  | 'needs_input'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'stopped'

export type AgentSession = {
  id: string
  workspaceId: string
  worktreeId: string | null
  agentDefinitionId: string
  model: string | null
  reasoningLevel: string | null
  status: SessionStatus
  processId: number | null
  startedAt: string | null
  endedAt: string | null
  lastActivityAt: string | null
  exitCode: number | null
}

export type DiffFile = {
  path: string
  additions: number
  deletions: number
  status: string
}

export type Diff = {
  files: DiffFile[]
  diff: string
}

// Field names here are snake_case, NOT camelCase — unlike the other DTOs
// above. AgentEvent only has #[serde(rename_all = "snake_case")] on the
// enum's variant tag (the "type" value); it doesn't rename inner fields,
// so serde emits them as written in Rust (session_id, exit_code, ...).
// Verified against real captured SSE output during Rung 5 testing.
export type AgentEvent =
  | { type: 'session_started'; session_id: string }
  | { type: 'message_delta'; session_id: string; role: string; text: string }
  | { type: 'tool_started'; session_id: string; tool: string; input: unknown }
  | { type: 'tool_output'; session_id: string; tool: string; output: string }
  | { type: 'file_changed'; session_id: string; path: string }
  | { type: 'needs_input'; session_id: string; question: string }
  | { type: 'usage_updated'; session_id: string; tokens: number | null }
  | { type: 'session_idle'; session_id: string }
  | { type: 'session_completed'; session_id: string; exit_code: number }
  | { type: 'session_error'; session_id: string; message: string }

export type TimelineEntry =
  | { type: 'message'; role: string; text: string }
  | ({ type: string } & Record<string, unknown>)

export type CommandScope = 'global' | 'workspace' | 'repository'

export type Command = {
  id: string
  scope: CommandScope
  scopeId: string | null
  name: string
  prompt: string
  createdAt: string
}

export type ScriptOutput = {
  stdout: string
  stderr: string
  exitCode: number
}

export type EditorAvailability = {
  vscode: boolean
  cursor: boolean
  zed: boolean
}
