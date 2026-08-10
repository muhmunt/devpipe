import type {
  AgentDefinition,
  AgentSession,
  Command,
  CommandScope,
  Commit,
  Diff,
  EditorAvailability,
  Repository,
  ScriptOutput,
  TimelineEntry,
  Worktree,
  Workspace,
} from './types'

const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  listWorkspaces: () => request<Workspace[]>('/workspaces'),
  createWorkspace: (body: { name: string; color?: string; icon?: string }) =>
    request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  getWorkspace: (id: string) => request<Workspace>(`/workspaces/${id}`),
  deleteWorkspace: (id: string) => request<void>(`/workspaces/${id}`, { method: 'DELETE' }),
  /// Creates workspace + first repository atomically (open an existing repo,
  /// or clone one first). Replaces the old two-call flow, which orphaned an
  /// empty workspace whenever the repository step failed.
  initWorkspace: (body: {
    name: string
    source: 'open' | 'clone'
    path: string
    cloneUrl?: string
    defaultBranch?: string
  }) =>
    request<{ workspace: Workspace; repository: Repository }>('/workspaces/init', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listRepositories: (workspaceId: string) => request<Repository[]>(`/workspaces/${workspaceId}/repositories`),
  createRepository: (body: { workspaceId: string; name: string; localPath: string; remoteUrl?: string; defaultBranch?: string }) =>
    request<Repository>('/repositories', { method: 'POST', body: JSON.stringify(body) }),
  cloneRepository: (body: { workspaceId: string; name: string; cloneUrl: string; destPath: string; defaultBranch?: string }) =>
    request<Repository>('/repositories/clone', { method: 'POST', body: JSON.stringify(body) }),
  getRepository: (id: string) => request<Repository>(`/repositories/${id}`),
  updateRepositoryScripts: (
    id: string,
    body: { setupScript?: string | null; runScript?: string | null; testScript?: string | null; teardownScript?: string | null },
  ) => request<Repository>(`/repositories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  listWorktrees: (repositoryId: string) => request<Worktree[]>(`/repositories/${repositoryId}/worktrees`),
  createWorktree: (repositoryId: string, body: { branch: string; targetBranch?: string }) =>
    request<Worktree>(`/repositories/${repositoryId}/worktrees`, { method: 'POST', body: JSON.stringify(body) }),
  getWorktree: (id: string) => request<Worktree>(`/worktrees/${id}`),
  deleteWorktree: (id: string) => request<void>(`/worktrees/${id}`, { method: 'DELETE' }),
  diffWorktree: (id: string) => request<Diff>(`/worktrees/${id}/diff`),
  listCommits: (id: string) => request<Commit[]>(`/worktrees/${id}/commits`),
  commitWorktree: (id: string, message: string) =>
    request<Worktree>(`/worktrees/${id}/commit`, { method: 'POST', body: JSON.stringify({ message }) }),
  pushWorktree: (id: string) => request<Worktree>(`/worktrees/${id}/push`, { method: 'POST' }),
  listFiles: (id: string) => request<string[]>(`/worktrees/${id}/files`),
  runScript: (worktreeId: string, script: 'setup' | 'run' | 'test' | 'teardown') =>
    request<ScriptOutput>(`/worktrees/${worktreeId}/run-script`, { method: 'POST', body: JSON.stringify({ script }) }),

  listAgentDefinitions: () => request<AgentDefinition[]>('/agent-definitions'),
  createAgentDefinition: (body: { id: string; name: string; executable: string; defaultArgs: string[] }) =>
    request<AgentDefinition>('/agent-definitions', { method: 'POST', body: JSON.stringify(body) }),
  detectAgents: () => request<Record<string, boolean>>('/agents/detect'),
  detectEditors: () => request<EditorAvailability>('/editors/detect'),

  listCommands: (params: { workspaceId?: string; repositoryId?: string }) => {
    const qs = new URLSearchParams()
    if (params.workspaceId) qs.set('workspaceId', params.workspaceId)
    if (params.repositoryId) qs.set('repositoryId', params.repositoryId)
    return request<Command[]>(`/commands?${qs}`)
  },
  createCommand: (body: { scope: CommandScope; scopeId?: string; name: string; prompt: string }) =>
    request<Command>('/commands', { method: 'POST', body: JSON.stringify(body) }),

  listSessionsObservability: (workspaceId: string) =>
    request<AgentSession[]>(`/observability/sessions?workspaceId=${workspaceId}`),

  createSession: (
    worktreeId: string,
    body: { agentDefinitionId: string; model?: string; reasoningLevel?: string; prompt: string },
  ) => request<AgentSession>(`/worktrees/${worktreeId}/sessions`, { method: 'POST', body: JSON.stringify(body) }),
  getTimeline: (sessionId: string) => request<TimelineEntry[]>(`/sessions/${sessionId}/timeline`),
  reply: (sessionId: string, input: string) =>
    request<void>(`/sessions/${sessionId}/reply`, { method: 'POST', body: JSON.stringify({ input }) }),
  eventsUrl: (sessionId: string, since?: string) =>
    `${BASE}/sessions/${sessionId}/events${since ? `?since=${encodeURIComponent(since)}` : ''}`,
}
